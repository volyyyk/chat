//! UniFFI-биндинги ядра для нативных клиентов (Swift/Kotlin, этап 2
//! ROADMAP_NATIVE.md): тонкие обёртки над lib (конверты x25519-box, raw X25519-DH,
//! bcrypt_verify) и ratchet (Double Ratchet).
//!
//! Отличия от napi-обёрток (src/node.rs):
//! - uniffi-методы Object иммутабельны (&self) — MedRatchetState держит
//!   Mutex<RatchetState> и мутирует под локом;
//! - uniffi-метаданные — обычный Rust (без внешних рантайм-символов):
//!   тесты обёрток линкуются в тестовый бинарник чисто, в отличие от napi
//!   (issue #1099) — их гоняет джоба CI uniffi-bindings:
//!   cargo test --no-default-features --features uniffi-bind,serde.
//!
//! Сборка и генерация обвязки (джоба CI uniffi-bindings):
//!   cargo build --release --no-default-features --features uniffi-bind,serde
//!   uniffi-bindgen generate --library target/release/libmedchat_core.so
//!     --language kotlin --out-dir uniffi-out/kotlin  (swift — аналогично).
//!
//! Как и в napi: персистентность — save()/restore() (feature serde):
//! bincode-буфер состояния ↔ secure storage вызывающей стороны (Keychain /
//! Android Keystore); буфер содержит СЕКРЕТЫ — не для логов и не для сервера.

use std::sync::Mutex;

use crate::ratchet::{AEAD_NONCE_SIZE, HEADER_SIZE};
use crate::{
    bcrypt_verify as core_bcrypt_verify, generate_keypair as core_generate_keypair,
    open_sealed as core_open_sealed, open_sealed_batch as core_open_sealed_batch,
    seal_for_recipients as core_seal_for_recipients,
    CoreError, KeyPair, RatchetMessage, RatchetState, SealedMessage, KEY_SIZE, NONCE_SIZE,
    x25519_dh as core_x25519_dh,
};

/// Ошибки для Swift/Kotlin. Отдельный enum (не CoreError напрямую):
/// uniffi::Error требует uniffi-совместимые поля; InvalidArgument добавлен
/// для ошибок длин на границе обёрток (аналог napi InvalidArg). Поле
/// называется detail, а не message: gen_kotlin uniffi-bindgen 0.28.3
/// генерирует val message, конфликтующий с Throwable.message
/// (прогон 42519176935, kotlinc: conflicting declarations).
#[derive(Debug, uniffi::Error)]
pub enum MedCryptoError {
    /// Ошибка шифрования/расшифровки (AEAD).
    Aead,
    /// Ни один бокс конверта не расшифрован нашей парой ключей.
    NoBoxForRecipient,
    /// Ratchet: нет ключа собеседника/цепочки (нужно первое сообщение).
    NotInitialized,
    /// Ratchet: replay / превышение лимитов skip-store.
    OutOfOrder,
    /// Ratchet: заголовок/wire неверной длины.
    BadHeader,
    /// Неверный формат bcrypt-хэша.
    BadHash,
    /// Неверная длина аргумента-байтового буфера на границе обёртки.
    InvalidArgument { detail: String },
}

// uniffi::Error (0.28) требует Display у ошибок экспортов: байндинг Result
// требует E: LowerError + Display + Debug + Send + Sync (LowerReturn для
// Result в uniffi_core/ffi_converter_impls.rs). derive uniffi::Error даёт
// LowerError, но Display пишется руками — человекочитаемые сообщения по
// вариантам (прогон #109: 8 x E0277 без него).
impl std::fmt::Display for MedCryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MedCryptoError::Aead => write!(f, "encryption or decryption failed (AEAD)"),
            MedCryptoError::NoBoxForRecipient => {
                write!(f, "no sealed box matches this key pair")
            }
            MedCryptoError::NotInitialized => {
                write!(f, "ratchet session is not initialized yet")
            }
            MedCryptoError::OutOfOrder => {
                write!(f, "message is out of order or skip limits exceeded")
            }
            MedCryptoError::BadHeader => write!(f, "malformed ratchet header or wire"),
            MedCryptoError::BadHash => write!(f, "invalid bcrypt hash format"),
            MedCryptoError::InvalidArgument { detail } => write!(f, "{}", detail),
        }
    }
}

impl From<CoreError> for MedCryptoError {
    fn from(e: CoreError) -> Self {
        match e {
            CoreError::Aead => MedCryptoError::Aead,
            CoreError::NoBoxForRecipient => MedCryptoError::NoBoxForRecipient,
            CoreError::NotInitialized => MedCryptoError::NotInitialized,
            CoreError::OutOfOrder => MedCryptoError::OutOfOrder,
            CoreError::BadHeader => MedCryptoError::BadHeader,
            CoreError::BadHash => MedCryptoError::BadHash,
        }
    }
}

fn need_len(buf: &[u8], n: usize, what: &str) -> Result<(), MedCryptoError> {
    if buf.len() != n {
        return Err(MedCryptoError::InvalidArgument {
            detail: format!("{} must be {} bytes, got {}", what, n, buf.len()),
        });
    }
    Ok(())
}

fn arr32(buf: &[u8], what: &str) -> Result<[u8; KEY_SIZE], MedCryptoError> {
    need_len(buf, KEY_SIZE, what)?;
    let mut a = [0u8; KEY_SIZE];
    a.copy_from_slice(buf);
    Ok(a)
}

fn arr24(buf: &[u8], what: &str) -> Result<[u8; NONCE_SIZE], MedCryptoError> {
    need_len(buf, NONCE_SIZE, what)?;
    let mut a = [0u8; NONCE_SIZE];
    a.copy_from_slice(buf);
    Ok(a)
}

fn arr12(buf: &[u8], what: &str) -> Result<[u8; AEAD_NONCE_SIZE], MedCryptoError> {
    need_len(buf, AEAD_NONCE_SIZE, what)?;
    let mut a = [0u8; AEAD_NONCE_SIZE];
    a.copy_from_slice(buf);
    Ok(a)
}

/// Пара ключей устройства: наружу отдаётся только public_key (E2E-контракт,
/// модель UserKey); secret остаётся в Keychain/Keystore.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MedKeyPair {
    pub public_key: Vec<u8>,
    pub secret_key: Vec<u8>,
}

/// Конверт x25519-box (wire-совместим с мобильным клиентом tweetnacl):
/// epk (32) + nonce (24) + боксы по одному на получателя (включая отправителя).
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MedSealedMessage {
    pub epk: Vec<u8>,
    pub nonce: Vec<u8>,
    pub boxes: Vec<Vec<u8>>,
}

/// Сообщение Double Ratchet: открытый заголовок (40) + nonce (12) +
/// AEAD-шифротекст. Раскладка как у RatchetMessage ядра.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MedRatchetMessage {
    pub header: Vec<u8>,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

/// Размер ключа X25519 (32).
#[uniffi::export]
pub fn key_size() -> u32 {
    KEY_SIZE as u32
}

/// Размер nonce XSalsa20 (24).
#[uniffi::export]
pub fn nonce_size() -> u32 {
    NONCE_SIZE as u32
}

/// Размер заголовка RatchetMessage в wire-формате (40).
#[uniffi::export]
pub fn ratchet_header_size() -> u32 {
    HEADER_SIZE as u32
}

/// Размер nonce AEAD в ratchet-сообщении (12).
#[uniffi::export]
pub fn ratchet_nonce_size() -> u32 {
    AEAD_NONCE_SIZE as u32
}

/// Сгенерировать новую пару X25519 (для устройства или эфемерную).
#[uniffi::export]
pub fn generate_keypair() -> MedKeyPair {
    let kp = core_generate_keypair();
    MedKeyPair {
        public_key: kp.public_key.to_vec(),
        secret_key: kp.secret_key.to_vec(),
    }
}

/// Зашифровать plaintext для списка публичных ключей получателей
/// (каждому — свой бокс под одной эфемерной парой).
#[uniffi::export]
pub fn seal_for_recipients(
    plaintext: Vec<u8>,
    recipient_public_keys: Vec<Vec<u8>>,
) -> Result<MedSealedMessage, MedCryptoError> {
    let mut keys = Vec::with_capacity(recipient_public_keys.len());
    for (i, k) in recipient_public_keys.iter().enumerate() {
        keys.push(arr32(k, &format!("recipient_public_keys[{}]", i))?);
    }
    let sealed = core_seal_for_recipients(&plaintext, &keys)?;
    Ok(MedSealedMessage {
        epk: sealed.epk.to_vec(),
        nonce: sealed.nonce.to_vec(),
        boxes: sealed.boxes,
    })
}

/// Элемент батч-расшифровки (длинные чаты): ok=false + пустой plaintext —
/// конверт не расшифрован (чужой ключ, битая длина); батч не падает целиком.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct MedOpenResult {
    pub ok: bool,
    pub plaintext: Vec<u8>,
}

/// Батч-расшифровка страницы конвертов: один FFI-вызов на окно сообщений
/// (кнопка «Показать более старые» расшифровывает страницу целиком).
/// Битые длины элемента — ok=false в этом элементе, не ошибка всего батча;
/// битые ключи самого устройства — ошибка всего вызова (ключ один на батч).
#[uniffi::export]
pub fn open_sealed_batch(
    sealeds: Vec<MedSealedMessage>,
    my_public: Vec<u8>,
    my_secret: Vec<u8>,
) -> Result<Vec<MedOpenResult>, MedCryptoError> {
    let my_public = arr32(&my_public, "my_public")?;
    let my_secret = arr32(&my_secret, "my_secret")?;
    Ok(sealeds
        .into_iter()
        .map(|sealed| {
            let epk = match arr32(&sealed.epk, "sealed.epk") {
                Ok(v) => v,
                Err(_) => return MedOpenResult { ok: false, plaintext: Vec::new() },
            };
            let nonce = match arr24(&sealed.nonce, "sealed.nonce") {
                Ok(v) => v,
                Err(_) => return MedOpenResult { ok: false, plaintext: Vec::new() },
            };
            let inner = SealedMessage {
                epk,
                nonce,
                boxes: sealed.boxes,
            };
            let out = core_open_sealed_batch(&[inner], &my_public, &my_secret);
            match out.into_iter().next() {
                Some(Ok(pt)) => MedOpenResult { ok: true, plaintext: pt },
                _ => MedOpenResult { ok: false, plaintext: Vec::new() },
            }
        })
        .collect())
}

/// Расшифровать конверт своим ключом: перебирает боксы, возвращает plaintext
/// первого расшифровываемого (чужой ключ — NoBoxForRecipient).
#[uniffi::export]
pub fn open_sealed(
    sealed: MedSealedMessage,
    my_public: Vec<u8>,
    my_secret: Vec<u8>,
) -> Result<Vec<u8>, MedCryptoError> {
    let my_public = arr32(&my_public, "my_public")?;
    let my_secret = arr32(&my_secret, "my_secret")?;
    let inner = SealedMessage {
        epk: arr32(&sealed.epk, "sealed.epk")?,
        nonce: arr24(&sealed.nonce, "sealed.nonce")?,
        boxes: sealed.boxes,
    };
    Ok(core_open_sealed(&inner, &my_public, &my_secret)?)
}

/// Raw X25519-DH (RFC 7748): общий секрет из приватного ключа этой стороны
/// и публичного ключа собеседника (identity-ключи реестра UserKey) — вход
/// init_initiator/init_responder Double Ratchet (этап 7). Скаляр клампится
/// по RFC 7748; KAT-вектор §6.1 сверяют все smoke-зеркала.
#[uniffi::export]
pub fn x25519_dh(my_secret: Vec<u8>, their_public: Vec<u8>) -> Result<Vec<u8>, MedCryptoError> {
    let sk = arr32(&my_secret, "my_secret")?;
    let pk = arr32(&their_public, "their_public")?;
    Ok(core_x25519_dh(&sk, &pk).to_vec())
}

/// Проверить пароль против bcrypt-хэша OpenBSD (cost 12 в authService):
/// Ok(false) при неверном пароле, BadHash на битом хэше.
#[uniffi::export]
pub fn bcrypt_verify(password: String, hash: String) -> Result<bool, MedCryptoError> {
    Ok(core_bcrypt_verify(&password, &hash)?)
}

fn to_core_ratchet_message(m: MedRatchetMessage) -> Result<RatchetMessage, MedCryptoError> {
    Ok(RatchetMessage {
        header: m.header,
        nonce: arr12(&m.nonce, "message.nonce")?,
        ciphertext: m.ciphertext,
    })
}

/// Сериализовать ratchet-сообщение в wire (header || nonce || ciphertext).
#[uniffi::export]
pub fn ratchet_message_to_wire(message: MedRatchetMessage) -> Result<Vec<u8>, MedCryptoError> {
    Ok(to_core_ratchet_message(message)?.to_wire())
}

/// Разобрать wire-байты в ratchet-сообщение (битая длина — BadHeader).
#[uniffi::export]
pub fn ratchet_message_from_wire(wire: Vec<u8>) -> Result<MedRatchetMessage, MedCryptoError> {
    let msg = RatchetMessage::from_wire(&wire)?;
    Ok(MedRatchetMessage {
        header: msg.header,
        nonce: msg.nonce.to_vec(),
        ciphertext: msg.ciphertext,
    })
}

/// Double Ratchet-сессия (одна — с одним собеседником). Методы uniffi
/// иммутабельны, состояние мутируется через Mutex. Персистентность —
/// save()/restore() (feature serde): bincode-буфер состояния ↔ secure
/// storage вызывающей стороны.
#[derive(uniffi::Object)]
pub struct MedRatchetState {
    inner: Mutex<RatchetState>,
}

fn lock(m: &Mutex<RatchetState>) -> std::sync::MutexGuard<'_, RatchetState> {
    // Poisoned lock означает панику в критической секции; состояние
    // ratchet консистентно (паники в ядре на целевых входах исключены
    // fuzz-целями), продолжаем с тем же состоянием.
    m.lock().unwrap_or_else(|p| p.into_inner())
}

#[uniffi::export]
impl MedRatchetState {
    /// Инициализация отправляющей стороны (пишет первой): shared_secret —
    /// предварительный DH (X25519 от identity-ключей из реестра UserKey).
    #[uniffi::constructor]
    pub fn init_initiator(
        shared_secret: Vec<u8>,
        remote_ratchet_public: Vec<u8>,
    ) -> Result<Self, MedCryptoError> {
        let ss = arr32(&shared_secret, "shared_secret")?;
        let rpk = arr32(&remote_ratchet_public, "remote_ratchet_public")?;
        let st = RatchetState::init_initiator(&ss, &rpk);
        Ok(MedRatchetState { inner: Mutex::new(st) })
    }

    /// Инициализация отвечающей стороны: отправка невозможна до первого
    /// полученного сообщения (нужен ratchet-ключ собеседника).
    #[uniffi::constructor]
    pub fn init_responder(
        shared_secret: Vec<u8>,
        my_ratchet_public: Vec<u8>,
        my_ratchet_secret: Vec<u8>,
    ) -> Result<Self, MedCryptoError> {
        let ss = arr32(&shared_secret, "shared_secret")?;
        let public_key = arr32(&my_ratchet_public, "my_ratchet_public")?;
        let secret_key = arr32(&my_ratchet_secret, "my_ratchet_secret")?;
        let st = RatchetState::init_responder(&ss, KeyPair { public_key, secret_key });
        Ok(MedRatchetState { inner: Mutex::new(st) })
    }

    /// Зашифровать plaintext (продвижение цепочки отправки).
    pub fn encrypt(&self, plaintext: Vec<u8>) -> Result<MedRatchetMessage, MedCryptoError> {
        let mut st = lock(&self.inner);
        let msg = st.encrypt(&plaintext)?;
        Ok(MedRatchetMessage {
            header: msg.header,
            nonce: msg.nonce.to_vec(),
            ciphertext: msg.ciphertext,
        })
    }

    /// Расшифровать сообщение (skip-store: внеочередные расшифровываются).
    pub fn decrypt(&self, message: MedRatchetMessage) -> Result<Vec<u8>, MedCryptoError> {
        let msg = to_core_ratchet_message(message)?;
        let mut st = lock(&self.inner);
        Ok(st.decrypt(&msg)?)
    }

    /// Расшифровать wire-байты (from_wire + decrypt одной кнопкой).
    pub fn decrypt_wire(&self, wire: Vec<u8>) -> Result<Vec<u8>, MedCryptoError> {
        let msg = RatchetMessage::from_wire(&wire)?;
        let mut st = lock(&self.inner);
        Ok(st.decrypt(&msg)?)
    }
}

// Персистентность сессии (этап 7, feature serde): bincode-буфер состояния.
// Отдельный impl-блок под #[cfg] на весь блок: cfg вырезает его ДО
// раскрытия #[uniffi::export] — при выключенной serde методов в обвязке
// нет начисто. Буфер содержит СЕКРЕТЫ (root key, цепочки, приватный
// ratchet-ключ): только secure storage устройства (Keychain/Keystore),
// никогда — логи или сервер.
#[cfg(feature = "serde")]
#[uniffi::export]
impl MedRatchetState {
    /// Сохранить состояние сессии (bincode) — для персистентности между
    /// запусками. Восстановление — MedRatchetState.restore(saved).
    pub fn save(&self) -> Result<Vec<u8>, MedCryptoError> {
        let st = lock(&self.inner);
        // bincode 3: bincode::serde::encode_to_vec (feature serde).
        bincode::serde::encode_to_vec(&*st, bincode::config::standard()).map_err(|e| {
            MedCryptoError::InvalidArgument {
                detail: format!("serialization failed: {}", e),
            }
        })
    }

    /// Восстановить сессию из буфера save(): счётчики и skip-store на
    /// месте, диалог продолжается. Битый буфер — InvalidArgument.
    #[uniffi::constructor]
    pub fn restore(saved: Vec<u8>) -> Result<Self, MedCryptoError> {
        let st: RatchetState =
            bincode::serde::decode_from_slice(&saved, bincode::config::standard())
                .map(|(v, _)| v)
                .map_err(|e| MedCryptoError::InvalidArgument {
                    detail: format!("deserialization failed: {}", e),
                })?;
        Ok(MedRatchetState {
            inner: Mutex::new(st),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_open_roundtrip_and_wrong_key() {
        let kp = generate_keypair();
        let other = generate_keypair();
        let sealed =
            seal_for_recipients(b"hello".to_vec(), vec![kp.public_key.clone()]).unwrap();
        assert_eq!(sealed.boxes.len(), 1);
        let pt = open_sealed(
            sealed.clone(),
            kp.public_key.clone(),
            kp.secret_key.clone(),
        )
        .unwrap();
        assert_eq!(pt, b"hello".to_vec());
        let err = open_sealed(sealed, other.public_key, other.secret_key).unwrap_err();
        assert!(matches!(err, MedCryptoError::NoBoxForRecipient));
    }

    #[test]
    fn invalid_lengths_rejected() {
        let err = seal_for_recipients(b"x".to_vec(), vec![vec![0u8; 31]]).unwrap_err();
        match err {
            MedCryptoError::InvalidArgument { detail } => {
                assert!(detail.contains("32 bytes, got 31"), "{}", detail);
            }
            other => panic!("unexpected: {:?}", other),
        }
        let kp = generate_keypair();
        let sealed = seal_for_recipients(b"x".to_vec(), vec![kp.public_key.clone()]).unwrap();
        let err = open_sealed(sealed, vec![0u8; 31], kp.secret_key).unwrap_err();
        assert!(matches!(err, MedCryptoError::InvalidArgument { .. }));
    }

    #[test]
    fn ratchet_wire_roundtrip_and_replay() {
        // X25519-пара обязана быть согласована (public = x25519(secret)):
        // фиктивные константы — баг #104/#105-класса, decrypt отвечал Aead.
        let bob_kp = generate_keypair();
        let alice =
            MedRatchetState::init_initiator(vec![7u8; 32], bob_kp.public_key.clone())
                .unwrap();
        let bob =
            MedRatchetState::init_responder(vec![7u8; 32], bob_kp.public_key, bob_kp.secret_key)
                .unwrap();
        let msg = alice.encrypt(b"ping".to_vec()).unwrap();
        assert_eq!(msg.header.len(), ratchet_header_size() as usize);
        let wire = ratchet_message_to_wire(msg).unwrap();
        assert_eq!(bob.decrypt_wire(wire.clone()).unwrap(), b"ping".to_vec());
        // replay того же wire: ключ израсходован — OutOfOrder
        let err = bob.decrypt_wire(wire).unwrap_err();
        assert!(matches!(err, MedCryptoError::OutOfOrder));
        // короткий wire — BadHeader
        let err = ratchet_message_from_wire(vec![0u8; 10]).unwrap_err();
        assert!(matches!(err, MedCryptoError::BadHeader));
    }

    #[test]
    fn bcrypt_kat_via_wrapper() {
        let hash = "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW";
        assert!(bcrypt_verify("U*U".to_string(), hash.to_string()).unwrap());
        assert!(!bcrypt_verify("U*U*".to_string(), hash.to_string()).unwrap());
        let err = bcrypt_verify("x".to_string(), "not-a-hash".to_string()).unwrap_err();
        assert!(matches!(err, MedCryptoError::BadHash));
    }

    #[test]
    fn constants_match_core() {
        assert_eq!(key_size(), 32);
        assert_eq!(nonce_size(), 24);
        assert_eq!(ratchet_header_size(), 40);
        assert_eq!(ratchet_nonce_size(), 12);
    }

    /// save/restore (feature serde): сессия переживает «рестарт» — после
    /// restore диалог продолжается, replay уже расшифрованного — OutOfOrder.
    #[cfg(feature = "serde")]
    #[test]
    fn ratchet_save_restore_roundtrip() {
        let bob_kp = generate_keypair();
        let alice =
            MedRatchetState::init_initiator(vec![7u8; 32], bob_kp.public_key.clone())
                .unwrap();
        let bob = MedRatchetState::init_responder(
            vec![7u8; 32],
            bob_kp.public_key.clone(),
            bob_kp.secret_key.clone(),
        )
        .unwrap();
        let m1 = alice.encrypt(b"persist me".to_vec()).unwrap();
        assert_eq!(bob.decrypt(m1.clone()).unwrap(), b"persist me".to_vec());

        // «рестарт»: состояние ушло в bincode-буфер и вернулось
        let saved = bob.save().unwrap();
        assert!(!saved.is_empty());
        assert!(MedRatchetState::restore(vec![0xffu8; 4]).is_err());
        let bob2 = MedRatchetState::restore(saved).unwrap();

        let m2 = alice.encrypt(b"after restore".to_vec()).unwrap();
        assert_eq!(bob2.decrypt(m2).unwrap(), b"after restore".to_vec());
        // replay m1 после restore — ключ израсходован
        let err = bob2.decrypt(m1).unwrap_err();
        assert!(matches!(err, MedCryptoError::OutOfOrder));
    }

    #[test]
    fn uniffi_batch_open_page() {
        let alice = generate_keypair();
        let bob = generate_keypair();
        let s1 =
            seal_for_recipients(b"page item".to_vec(), vec![alice.public_key.clone(), bob.public_key.clone()]).unwrap();
        let s2 =
            seal_for_recipients(b"only alice".to_vec(), vec![alice.public_key.clone()]).unwrap();
        let s3 = seal_for_recipients(b"not for alice".to_vec(), vec![bob.public_key.clone()]).unwrap();
        let out = open_sealed_batch(
            vec![s1.clone(), s2.clone(), s3.clone()],
            alice.public_key.clone(),
            alice.secret_key.clone(),
        )
        .unwrap();
        assert_eq!(out.len(), 3);
        assert!(out[0].ok);
        assert_eq!(out[0].plaintext, b"page item".to_vec());
        assert!(out[1].ok);
        assert!(!out[2].ok);
        assert!(out[2].plaintext.is_empty());
        let for_bob = open_sealed_batch(vec![s1, s3], bob.public_key, bob.secret_key).unwrap();
        assert!(for_bob[0].ok);
        assert_eq!(for_bob[1].plaintext, b"not for alice".to_vec());
        let _ = s2;
    }

    /// KAT RFC 7748 §6.1 (DH-вектор Curve25519) через обёртку x25519Dh:
    /// публичный ключ = X25519(priv, basepoint 9), DH-симметрия на
    /// сгенерированных парах, битая длина — InvalidArgument до криптографии.
    #[test]
    fn uniffi_x25519_dh_rfc7748_kat() {
        fn hex32(s: &str) -> [u8; KEY_SIZE] {
            let mut out = [0u8; KEY_SIZE];
            for i in 0..KEY_SIZE {
                out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
            }
            out
        }
        let a = hex32("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
        let b = hex32("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
        let a_pub = hex32("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
        let b_pub = hex32("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");
        let k = hex32("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742");
        let mut basepoint = [0u8; KEY_SIZE];
        basepoint[0] = 9;
        assert_eq!(
            x25519_dh(a.to_vec(), basepoint.to_vec()).unwrap(),
            a_pub.to_vec()
        );
        assert_eq!(
            x25519_dh(b.to_vec(), basepoint.to_vec()).unwrap(),
            b_pub.to_vec()
        );
        assert_eq!(x25519_dh(a.to_vec(), b_pub.to_vec()).unwrap(), k.to_vec());
        assert_eq!(x25519_dh(b.to_vec(), a_pub.to_vec()).unwrap(), k.to_vec());
        let ka = generate_keypair();
        let kb = generate_keypair();
        assert_eq!(
            x25519_dh(ka.secret_key.clone(), kb.public_key.clone()).unwrap(),
            x25519_dh(kb.secret_key.clone(), ka.public_key.clone()).unwrap()
        );
        let err = x25519_dh(vec![0u8; 31], b_pub.to_vec()).unwrap_err();
        assert!(matches!(err, MedCryptoError::InvalidArgument { .. }));
    }
}

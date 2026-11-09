//! Node.js-биндинги ядра (napi-rs, этап 2 ROADMAP_NATIVE.md).
//!
//! Тонкие обёртки над примитивами lib.rs. JS-имена camelCase (генерирует
//! napi-rs): generateKeypair, sealForRecipients, openSealed, x25519Dh, keySize,
//! nonceSize; JsKeyPair → { publicKey, secretKey }, JsSealedMessage →
//! { epk, nonce, boxes }.
//!
//! Double Ratchet (этап 7, прототип): класс JsRatchetState с фабриками
//! initInitiator/initResponder и методами encrypt/decrypt/decryptWire;
//! ratchetMessageToWire/ratchetMessageFromWire, ratchetHeaderSize (40),
//! ratchetNonceSize (12). Персистентность (feature serde): save()/restore()
//! JsRatchetState — postcard-буфер состояния для secure storage вызывающей
//! стороны; буфер содержит секреты — не для логов и не для сервера.
//!
//! E2E-контракт не меняется: JS собирает JSON-конверт
//! { v: 1, alg: "x25519-box", epk, nonce, boxes: { [userId]: ct } } поверх
//! бинарных полей (base64 — на JS-стороне); раскладка бинарно совместима
//! с tweetnacl мобильного клиента (проверено контракт-вектором 1ce9516).
//!
//! Ошибки: CoreError → napi::Error (GenericFailure, message = Display,
//! например "no box in envelope decryptable by this keypair"); неверная
//! длина аргумента → InvalidArg с ожидаемым размером.
//!
//! Сборка .node-артефакта — джоба CI napi-build: cargo build --release
//! (cdylib) → rename в medchat-core.linux-x64-gnu.node + Node-интеграция
//! обёрток (napi-smoke.js — JS-зеркало тестов ниже) + upload-artifact.
//! napi-cli (napi build) — опция прод-упаковки с метаданными платформ.

use napi::bindgen_prelude::{Buffer, Result};
use napi::{Error as NapiError, Status};
use napi_derive::napi;

use crate::{
    open_sealed as core_open, seal_for_recipients as core_seal, CoreError, KeyPair,
    RatchetMessage, RatchetState, SealedMessage, KEY_SIZE, NONCE_SIZE,
    x25519_dh as core_dh,
};
use crate::ratchet::{AEAD_NONCE_SIZE, HEADER_SIZE};

fn core_err(e: CoreError) -> NapiError {
    NapiError::new(Status::GenericFailure, format!("{}", e))
}

fn arg_err(msg: String) -> NapiError {
    NapiError::new(Status::InvalidArg, msg)
}

/// &[u8] из Buffer (аннотация типа фиксирует выбор AsRef).
fn bytes(b: &Buffer) -> &[u8] {
    b.as_ref()
}

/// Проверить длину и скопировать в [u8; 32].
fn fixed32(b: &Buffer, name: &str) -> Result<[u8; KEY_SIZE]> {
    if b.len() != KEY_SIZE {
        return Err(arg_err(format!(
            "{} must be {} bytes, got {}",
            name, KEY_SIZE, b.len()
        )));
    }
    let mut arr = [0u8; KEY_SIZE];
    arr.copy_from_slice(bytes(b));
    Ok(arr)
}

/// Пара ключей устройства. ВАЖНО: secret_key не покидает вызывающую
/// сторону — сервер-обёртка обязана держать его вне логов и ответов API.
#[napi(object)]
pub struct JsKeyPair {
    pub public_key: Buffer,
    pub secret_key: Buffer,
}

/// Запечатанное сообщение: эфемерный pubkey + nonce + боксы (по одному
/// на получателя, включая бокс отправителя — его другие устройства).
#[napi(object)]
pub struct JsSealedMessage {
    pub epk: Buffer,
    pub nonce: Buffer,
    pub boxes: Vec<Buffer>,
}

/// Размер (в байтах) публичного/приватного X25519-ключа — 32.
#[napi]
pub fn key_size() -> u32 {
    KEY_SIZE as u32
}

/// Размер nonce XSalsa20 — 24 (как в NaCl).
#[napi]
pub fn nonce_size() -> u32 {
    NONCE_SIZE as u32
}

/// Сгенерировать пару X25519 (устройство или эфемерная).
#[napi]
pub fn generate_keypair() -> JsKeyPair {
    let kp = crate::generate_keypair();
    JsKeyPair {
        public_key: Buffer::from(kp.public_key.to_vec()),
        secret_key: Buffer::from(kp.secret_key.to_vec()),
    }
}

/// Зашифровать plaintext для списка публичных ключей получателей
/// (32 байта каждый). Возвращает { epk, nonce, boxes }.
#[napi]
pub fn seal_for_recipients(
    plaintext: Buffer,
    recipient_public_keys: Vec<Buffer>,
) -> Result<JsSealedMessage> {
    let pt: &[u8] = plaintext.as_ref();
    let mut keys = Vec::with_capacity(recipient_public_keys.len());
    for (i, k) in recipient_public_keys.iter().enumerate() {
        keys.push(fixed32(k, &format!("recipient_public_keys[{}]", i))?);
    }
    let sealed = core_seal(pt, &keys).map_err(core_err)?;
    Ok(JsSealedMessage {
        epk: Buffer::from(sealed.epk.to_vec()),
        nonce: Buffer::from(sealed.nonce.to_vec()),
        boxes: sealed.boxes.into_iter().map(Buffer::from).collect(),
    })
}

/// Расшифровать конверт своим ключом: перебирает боксы, возвращает
/// plaintext первого расшифрованного (иначе NoBoxForRecipient).
#[napi]
pub fn open_sealed(
    epk: Buffer,
    nonce: Buffer,
    boxes: Vec<Buffer>,
    my_public: Buffer,
    my_secret: Buffer,
) -> Result<Buffer> {
    let epk_arr = fixed32(&epk, "epk")?;
    let my_public_arr = fixed32(&my_public, "myPublic")?;
    let my_secret_arr = fixed32(&my_secret, "mySecret")?;
    if nonce.len() != NONCE_SIZE {
        return Err(arg_err(format!(
            "nonce must be {} bytes, got {}",
            NONCE_SIZE, nonce.len()
        )));
    }
    let mut nonce_arr = [0u8; NONCE_SIZE];
    nonce_arr.copy_from_slice(bytes(&nonce));

    let sealed = SealedMessage {
        epk: epk_arr,
        nonce: nonce_arr,
        boxes: boxes.iter().map(|b| bytes(b).to_vec()).collect(),
    };
    let plaintext = core_open(&sealed, &my_public_arr, &my_secret_arr).map_err(core_err)?;
    Ok(Buffer::from(plaintext))
}

/// Raw X25519-DH (RFC 7748): общий секрет из секретного ключа этой
/// стороны и публичного ключа собеседника (32 + 32 байта). Назначение
/// (этап 7): shared secret из identity-ключей реестра UserKey для
/// initInitiator/initResponder Double Ratchet; скаляр клампится по RFC 7748.
#[napi]
pub fn x25519_dh(my_secret: Buffer, their_public: Buffer) -> Result<Buffer> {
    let sk = fixed32(&my_secret, "mySecret")?;
    let pk = fixed32(&their_public, "theirPublic")?;
    Ok(Buffer::from(core_dh(&sk, &pk).to_vec()))
}

/// Батч-расшифровка окна конвертов (длинные чаты): один FFI-вызов на
/// страницу вместо N вызовов openSealed. Элемент с чужим ключом —
/// ok=false и пустой text, батч не падает целиком.
#[napi(object)]
pub struct JsBatchOpen {
    pub ok: Vec<bool>,
    pub texts: Vec<Buffer>,
}

#[napi]
pub fn open_sealed_batch(
    envelopes: Vec<JsSealedMessage>,
    my_public: Buffer,
    my_secret: Buffer,
) -> Result<JsBatchOpen> {
    let my_public_arr = fixed32(&my_public, "myPublic")?;
    let my_secret_arr = fixed32(&my_secret, "mySecret")?;
    let mut ok = Vec::with_capacity(envelopes.len());
    let mut texts = Vec::with_capacity(envelopes.len());
    for e in &envelopes {
        let epk_arr = match fixed32(&e.epk, "epk") {
            Ok(v) => v,
            Err(_) => {
                ok.push(false);
                texts.push(Buffer::from(Vec::new()));
                continue;
            }
        };
        let mut nonce_arr = [0u8; NONCE_SIZE];
        if e.nonce.len() == NONCE_SIZE {
            nonce_arr.copy_from_slice(bytes(&e.nonce));
        } else {
            ok.push(false);
            texts.push(Buffer::from(Vec::new()));
            continue;
        }
        let sealed = SealedMessage {
            epk: epk_arr,
            nonce: nonce_arr,
            boxes: e.boxes.iter().map(|b| bytes(b).to_vec()).collect(),
        };
        match core_open(&sealed, &my_public_arr, &my_secret_arr) {
            Ok(pt) => {
                ok.push(true);
                texts.push(Buffer::from(pt));
            }
            Err(_) => {
                ok.push(false);
                texts.push(Buffer::from(Vec::new()));
            }
        }
    }
    Ok(JsBatchOpen { ok, texts })
}

// ----- Серверные горячие пути (этап 6): checksum для Node ----------

/// SHA-256 от буфера → hex (64, lowercase). KAT FIPS 180-4, байт-в-байт
/// с node:crypto (crypto.createHash("sha256")) — parity сверяет napi-smoke.js.
#[napi]
pub fn sha256_checksum(data: Buffer) -> String {
    crate::hotpath::sha256_hex(bytes(&data))
}

/// Сверить буфер с ожидаемым SHA-256 hex (регистр/краевые пробелы не
/// важны): контроль целостности бэкапов/файлов из Node одним вызовом.
#[napi]
pub fn sha256_verify(data: Buffer, expected_hex: String) -> bool {
    crate::hotpath::sha256_verify(bytes(&data), &expected_hex)
}

// ----- Серверные горячие пути (этап 6): gzip-сжатие бэкапов ---------

/// Gzip-сжатие буфера (RFC 1952): для бэкапов — ДО шифрования. Формат
/// стандартный: cross-parity с node:zlib проверяет napi-smoke.js.
#[napi]
pub fn backup_compress(data: Buffer) -> Buffer {
    Buffer::from(crate::hotpath::gzip_compress(bytes(&data)))
}

/// Gzip-распаковка: Err → JS-исключение (битый бэкап не роняет процесс).
#[napi]
pub fn backup_decompress(data: Buffer) -> Result<Buffer> {
    crate::hotpath::gzip_decompress(bytes(&data))
        .map_err(arg_err)
        .map(Buffer::from)
}

// ----- Double Ratchet (этап 7, прототип): биндинги для Node -----

/// Wire-сообщение Double Ratchet (части): header (40) || nonce (12) || ciphertext.
#[napi(object)]
pub struct JsRatchetMessage {
    pub header: Buffer,
    pub nonce: Buffer,
    pub ciphertext: Buffer,
}

/// Проверить длину и скопировать в [u8; 12] (nonce AES-256-GCM).
fn fixed12(b: &Buffer, name: &str) -> Result<[u8; AEAD_NONCE_SIZE]> {
    if b.len() != AEAD_NONCE_SIZE {
        return Err(arg_err(format!(
            "{} must be {} bytes, got {}",
            name, AEAD_NONCE_SIZE, b.len()
        )));
    }
    let mut arr = [0u8; AEAD_NONCE_SIZE];
    arr.copy_from_slice(bytes(b));
    Ok(arr)
}

/// HEADER_SIZE Double Ratchet: dh_pub (32) + pn (4) + n (4) = 40.
#[napi]
pub fn ratchet_header_size() -> u32 {
    HEADER_SIZE as u32
}

/// Размер nonce AES-256-GCM — 12 байт.
#[napi]
pub fn ratchet_nonce_size() -> u32 {
    AEAD_NONCE_SIZE as u32
}

/// Собрать wire-байты (header || nonce || ciphertext) из частей сообщения.
#[napi]
pub fn ratchet_message_to_wire(
    header: Buffer,
    nonce: Buffer,
    ciphertext: Buffer,
) -> Result<Buffer> {
    let nonce_arr = fixed12(&nonce, "nonce")?;
    let msg = RatchetMessage {
        header: bytes(&header).to_vec(),
        nonce: nonce_arr,
        ciphertext: bytes(&ciphertext).to_vec(),
    };
    Ok(Buffer::from(msg.to_wire()))
}

/// Разобрать wire-байты на { header, nonce, ciphertext }. Битая длина →
/// BadHeader (GenericFailure) сразу, не на decrypt.
#[napi]
pub fn ratchet_message_from_wire(wire: Buffer) -> Result<JsRatchetMessage> {
    let msg = RatchetMessage::from_wire(bytes(&wire)).map_err(core_err)?;
    Ok(JsRatchetMessage {
        header: Buffer::from(msg.header),
        nonce: Buffer::from(msg.nonce.to_vec()),
        ciphertext: Buffer::from(msg.ciphertext),
    })
}

/// Состояние Double Ratchet одной стороны диалога. Секреты (root key,
/// цепочки, приватный ratchet-ключ) живут в памяти объекта; save()/restore()
/// (feature serde) сериализуют состояние в postcard-буфер — персистентность
/// сессии на вызывающей стороне (secure storage устройства).
#[napi]
pub struct JsRatchetState {
    inner: RatchetState,
}

#[napi]
impl JsRatchetState {
    /// Инициирующая сторона (пишет первой). sharedSecret — предварительный
    /// DH (X25519 identity-ключей, например из реестра UserKey),
    /// remoteRatchetPublic — ratchet-ключ собеседника (32 байта).
    #[napi(factory)]
    pub fn init_initiator(shared_secret: Buffer, remote_ratchet_public: Buffer) -> Result<Self> {
        let sk = fixed32(&shared_secret, "sharedSecret")?;
        let remote = fixed32(&remote_ratchet_public, "remoteRatchetPublic")?;
        Ok(JsRatchetState {
            inner: RatchetState::init_initiator(&sk, &remote),
        })
    }

    /// Отвечающая сторона: отправка невозможна до первого полученного
    /// сообщения (нужен ratchet-ключ собеседника — как PreKey в Signal).
    /// myRatchetPublic + myRatchetSecret — ratchet-ключи (32 + 32 байта).
    #[napi(factory)]
    pub fn init_responder(
        shared_secret: Buffer,
        my_ratchet_public: Buffer,
        my_ratchet_secret: Buffer,
    ) -> Result<Self> {
        let sk = fixed32(&shared_secret, "sharedSecret")?;
        let pk = fixed32(&my_ratchet_public, "myRatchetPublic")?;
        let secret = fixed32(&my_ratchet_secret, "myRatchetSecret")?;
        Ok(JsRatchetState {
            inner: RatchetState::init_responder(
                &sk,
                KeyPair {
                    public_key: pk,
                    secret_key: secret,
                },
            ),
        })
    }

    /// Зашифровать plaintext: → { header, nonce, ciphertext }. Заголовок
    /// (dh_pub, pn, n) открытый — как в Signal.
    #[napi]
    pub fn encrypt(&mut self, plaintext: Buffer) -> Result<JsRatchetMessage> {
        let msg = self.inner.encrypt(bytes(&plaintext)).map_err(core_err)?;
        Ok(JsRatchetMessage {
            header: Buffer::from(msg.header),
            nonce: Buffer::from(msg.nonce.to_vec()),
            ciphertext: Buffer::from(msg.ciphertext),
        })
    }

    /// Расшифровать по частям. Внеочередные сообщения — через skip-store
    /// (MAX_SKIP/MAX_SKIPPED_KEYS), replay отклоняется.
    #[napi]
    pub fn decrypt(
        &mut self,
        header: Buffer,
        nonce: Buffer,
        ciphertext: Buffer,
    ) -> Result<Buffer> {
        let nonce_arr = fixed12(&nonce, "nonce")?;
        let msg = RatchetMessage {
            header: bytes(&header).to_vec(),
            nonce: nonce_arr,
            ciphertext: bytes(&ciphertext).to_vec(),
        };
        let pt = self.inner.decrypt(&msg).map_err(core_err)?;
        Ok(Buffer::from(pt))
    }

    /// Расшифровать wire-байты (header || nonce || ciphertext) одним вызовом.
    #[napi]
    pub fn decrypt_wire(&mut self, wire: Buffer) -> Result<Buffer> {
        let msg = RatchetMessage::from_wire(bytes(&wire)).map_err(core_err)?;
        let pt = self.inner.decrypt(&msg).map_err(core_err)?;
        Ok(Buffer::from(pt))
    }
}

// Персистентность сессии (этап 7, feature serde): postcard-буфер состояния.
// Отдельный impl-блок под #[cfg] на весь блок: cfg вырезает его ДО
// раскрытия #[napi] — при выключенной serde методов в API нет начисто.
// Буфер содержит СЕКРЕТЫ (root key, цепочки, приватный ratchet-ключ):
// только secure storage устройства (Keychain/Keystore), никогда — логи
// или сервер.
#[cfg(feature = "serde")]
#[napi]
impl JsRatchetState {
    /// Сохранить состояние сессии (postcard) — для персистентности между
    /// запусками. Восстановление — JsRatchetState.restore(saved).
    #[napi]
    pub fn save(&self) -> Result<Buffer> {
        // postcard: to_allocvec (serde, varint-формат).
        let buf = postcard::to_allocvec(&self.inner)
            .map_err(|e| NapiError::new(Status::GenericFailure, format!("{}", e)))?;
        Ok(Buffer::from(buf))
    }

    /// Восстановить состояние из буфера save(): счётчики и skip-store
    /// на месте, диалог продолжается. Битый буфер — GenericFailure.
    #[napi(factory)]
    pub fn restore(saved: Buffer) -> Result<Self> {
        let inner: RatchetState = postcard::from_bytes(bytes(&saved))
                .map_err(|e| NapiError::new(Status::GenericFailure, format!("{}", e)))?;
        Ok(JsRatchetState { inner })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn napi_keypair_sizes() {
        let kp = generate_keypair();
        assert_eq!(bytes(&kp.public_key).len(), KEY_SIZE);
        assert_eq!(bytes(&kp.secret_key).len(), KEY_SIZE);
        assert_eq!(key_size(), KEY_SIZE as u32);
        assert_eq!(nonce_size(), NONCE_SIZE as u32);
    }

    #[test]
    fn napi_seal_open_roundtrip() {
        let alice = generate_keypair();
        let bob = generate_keypair();
        let sealed = seal_for_recipients(
            Buffer::from(b"roundtrip via napi wrappers".to_vec()),
            vec![alice.public_key, bob.public_key.clone()],
        )
        .unwrap();
        assert_eq!(sealed.boxes.len(), 2);
        assert_eq!(bytes(&sealed.nonce).len(), NONCE_SIZE);

        let opened = open_sealed(
            Buffer::from(bytes(&sealed.epk).to_vec()),
            Buffer::from(bytes(&sealed.nonce).to_vec()),
            sealed
                .boxes
                .iter()
                .map(|b| Buffer::from(bytes(b).to_vec()))
                .collect(),
            bob.public_key,
            bob.secret_key,
        )
        .unwrap();
        assert_eq!(bytes(&opened), b"roundtrip via napi wrappers");
    }

    #[test]
    fn napi_bad_length_is_invalid_arg() {
        let alice = generate_keypair();
        // Buffer не реализует Debug → Result<Buffer,_>::unwrap_err() не
        // компилируется (E0277); берём err() → Option<NapiError>::unwrap.
        let err = open_sealed(
            Buffer::from(vec![0u8; 31]), // epk не той длины
            Buffer::from(vec![0u8; NONCE_SIZE]),
            vec![],
            alice.public_key,
            alice.secret_key,
        )
        .err()
        .unwrap();
        assert!(err.to_string().contains("epk must be 32 bytes, got 31"));
    }

    /// Hot-path checksum (этап 6): KAT FIPS 180-4 через napi-обёртки.
    #[test]
    fn napi_sha256_kat() {
        let hex = sha256_checksum(Buffer::from(b"abc".to_vec()));
        assert_eq!(
            hex,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert!(sha256_verify(
            Buffer::from(b"abc".to_vec()),
            "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD".to_string()
        ));
        assert!(!sha256_verify(
            Buffer::from(b"abc".to_vec()),
            hex.replace('8', "9")
        ));
    }

    /// Gzip-обёртки: roundtrip + magic bytes + битый поток (parity с
    /// node:zlib — в napi-smoke.js, тут проверяем логику обёрток).
    #[test]
    fn napi_backup_compress_roundtrip() {
        let data = b"MedChat backup json ".repeat(32);
        let packed = backup_compress(Buffer::from(data.clone()));
        assert_eq!(&packed[..3], &[0x1f, 0x8b, 0x08]);
        assert!(packed.len() < data.len());
        let restored = backup_decompress(packed).unwrap();
        assert_eq!(bytes(&restored).to_vec(), data);
        assert!(backup_decompress(Buffer::from(b"nope".to_vec())).is_err());
    }

    fn b32(v: u8) -> Buffer {
        Buffer::from(vec![v; 32])
    }

    /// Обёртки ratchet поверх фиксированного shared secret: сам X25519-DH
    /// (получение shared secret из identity-ключей) тестируется в ratchet.rs,
    /// здесь проверяется корректность JS-обёрток.
    fn ratchet_pair(seed: u8) -> (JsRatchetState, JsRatchetState, crate::KeyPair) {
        let bob_ratchet = crate::generate_keypair();
        let alice = JsRatchetState::init_initiator(
            b32(seed),
            Buffer::from(bob_ratchet.public_key.to_vec()),
        )
        .unwrap();
        let bob = JsRatchetState::init_responder(
            b32(seed),
            Buffer::from(bob_ratchet.public_key.to_vec()),
            Buffer::from(bob_ratchet.secret_key.to_vec()),
        )
        .unwrap();
        (alice, bob, bob_ratchet)
    }

    fn parts(m: &JsRatchetMessage) -> (Buffer, Buffer, Buffer) {
        (
            Buffer::from(bytes(&m.header).to_vec()),
            Buffer::from(bytes(&m.nonce).to_vec()),
            Buffer::from(bytes(&m.ciphertext).to_vec()),
        )
    }

    #[test]
    fn napi_ratchet_roundtrip_and_wire() {
        let (mut alice, mut bob, _) = ratchet_pair(7);

        let m1 = alice
            .encrypt(Buffer::from(b"napi ratchet one".to_vec()))
            .unwrap();
        let (h, n, c) = parts(&m1);
        let opened = bob.decrypt(h, n, c).unwrap();
        assert_eq!(bytes(&opened), b"napi ratchet one");

        // Bob отвечает (DH-ratchet у Alice), Alice читает через decryptWire
        let m2 = bob
            .encrypt(Buffer::from(b"napi ratchet two".to_vec()))
            .unwrap();
        let (h, n, c) = parts(&m2);
        let wire = ratchet_message_to_wire(h, n, c).unwrap();
        assert_eq!(
            bytes(&wire).len(),
            (ratchet_header_size() as usize)
                + (ratchet_nonce_size() as usize)
                + (b"napi ratchet two".len() + 16) // GCM tag
        );
        let opened2 = alice
            .decrypt_wire(Buffer::from(bytes(&wire).to_vec()))
            .unwrap();
        assert_eq!(bytes(&opened2), b"napi ratchet two");

        // from_wire → части; header всегда 40 байт
        let restored = ratchet_message_from_wire(Buffer::from(bytes(&wire).to_vec())).unwrap();
        assert_eq!(bytes(&restored.header).len(), ratchet_header_size() as usize);
        assert_eq!(bytes(&restored.nonce).len(), ratchet_nonce_size() as usize);
    }

    #[test]
    fn napi_ratchet_out_of_order_via_skip_store() {
        let (mut alice, mut bob, _) = ratchet_pair(9);
        let m1 = alice.encrypt(Buffer::from(b"first".to_vec())).unwrap();
        let m2 = alice.encrypt(Buffer::from(b"second".to_vec())).unwrap();

        // m2 приходит раньше m1: skip-store выводит ключ n=1 заранее
        let (h, n, c) = parts(&m2);
        let pt2 = bob.decrypt(h, n, c).unwrap();
        assert_eq!(bytes(&pt2), b"second");

        // m1 доходит позже и расшифровывается из skip-store
        let (h, n, c) = parts(&m1);
        let pt1 = bob.decrypt(h, n, c).unwrap();
        assert_eq!(bytes(&pt1), b"first");
    }

    #[test]
    fn napi_ratchet_bad_nonce_length() {
        let (_alice, mut bob, bob_ratchet) = ratchet_pair(3);
        // bob ещё не может расшифнуть (нет ratchet-ключа отправителя), но
        // валидация длины nonce отрабатывает до криптографии
        let _ = bob_ratchet; // ключ использован в ratchet_pair
        // Buffer не реализует Debug (E0277) → err().unwrap(), не unwrap_err()
        let err = bob
            .decrypt(
                Buffer::from(vec![0u8; 40]),
                Buffer::from(vec![0u8; 11]), // nonce не той длины
                Buffer::from(vec![]),
            )
            .err()
            .unwrap();
        assert!(err.to_string().contains("nonce must be 12 bytes, got 11"));
    }

    /// save/restore (feature serde): сессия переживает «рестарт» — счётчики
    /// и skip-store восстановлены; replay уже расшифрованного сообщения
    /// отклоняется и после restore.
    #[cfg(feature = "serde")]
    #[test]
    fn napi_ratchet_save_restore_roundtrip() {
        let (mut alice, mut bob, _) = ratchet_pair(6);
        let m1 = alice
            .encrypt(Buffer::from(b"persist me".to_vec()))
            .unwrap();
        let (h, n, c) = parts(&m1);
        let pt1 = bob.decrypt(h, n, c).unwrap();
        assert_eq!(bytes(&pt1), b"persist me");

        // «рестарт процесса»: состояние ушло в postcard-буфер и вернулось
        let saved = bob.save().unwrap();
        assert!(saved.len() > 0);
        assert!(JsRatchetState::restore(Buffer::from(vec![0xffu8; 4])).is_err());
        let mut bob2 = JsRatchetState::restore(saved).unwrap();

        let m2 = alice
            .encrypt(Buffer::from(b"after restore".to_vec()))
            .unwrap();
        let (h, n, c) = parts(&m2);
        let pt2 = bob2.decrypt(h, n, c).unwrap();
        assert_eq!(bytes(&pt2), b"after restore");

        // replay m1 после restore — ключ израсходован, OutOfOrder
        let (h, n, c) = parts(&m1);
        assert!(bob2.decrypt(h, n, c).is_err());
    }

    #[test]
    fn napi_batch_open_page() {
        let alice = generate_keypair();
        let bob = generate_keypair();
        let s1 = seal_for_recipients(
            Buffer::from(b"page item".to_vec()),
            vec![alice.public_key.clone(), bob.public_key.clone()],
        )
        .unwrap();
        let s2 =
            seal_for_recipients(Buffer::from(b"only alice".to_vec()), vec![alice.public_key.clone()]).unwrap();
        let env = |s: &JsSealedMessage| JsSealedMessage {
            epk: Buffer::from(bytes(&s.epk).to_vec()),
            nonce: Buffer::from(bytes(&s.nonce).to_vec()),
            boxes: s.boxes.iter().map(|b| Buffer::from(bytes(b).to_vec())).collect(),
        };
        let out = open_sealed_batch(vec![env(&s1), env(&s2)], alice.public_key, alice.secret_key)
            .unwrap();
        assert_eq!(out.ok, vec![true, true]);
        assert_eq!(bytes(&out.texts[0]), b"page item");
        let stranger = open_sealed_batch(vec![env(&s1)], bob.public_key, bob.secret_key).unwrap();
        assert_eq!(stranger.ok, vec![false]);
        assert!(bytes(&stranger.texts[0]).is_empty());
    }

    /// KAT RFC 7748 §6.1 (DH-вектор Curve25519) через обёртку x25519Dh.
    #[test]
    fn napi_x25519_dh_rfc7748_kat() {
        fn hex32(s: &str) -> [u8; KEY_SIZE] {
            let mut out = [0u8; KEY_SIZE];
            for i in 0..KEY_SIZE {
                out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
            }
            out
        }
        let a = hex32("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
        let b_pub = hex32("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");
        let k = hex32("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742");
        let shared = x25519_dh(
            Buffer::from(a.to_vec()),
            Buffer::from(b_pub.to_vec()),
        )
        .unwrap();
        assert_eq!(bytes(&shared), k.as_slice());
        // битая длина — InvalidArg до криптографии
        let err = x25519_dh(Buffer::from(vec![0u8; 31]), Buffer::from(b_pub.to_vec()))
            .err()
            .unwrap();
        assert!(err.to_string().contains("mySecret must be 32 bytes, got 31"));
    }
}

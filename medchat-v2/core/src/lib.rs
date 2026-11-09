//! medchat-core: криптографическое ядро MedChat (этап 2 ROADMAP_NATIVE.md).
//!
//! Примитивы сквозного E2E-шифрования сообщений. Формат конверта совместим с
//! мобильным клиентом (tweetnacl, x25519-box) и серверным контрактом
//! (docs/readme_for_AI.md, раздел «E2E-контракт»):
//!
//! { v: 1, alg: "x25519-box", epk: <ephemeral pubkey>, nonce: <24 bytes>,
//!   boxes: { [userId]: <ciphertext> } }
//!
//! Используется SalsaBox = X25519 + XSalsa20-Poly1305 (классический NaCl box,
//! тот же алгоритм, что у tweetnacl nacl.box) — конверты, запечатанные здесь,
//! открываются мобильным клиентом, и наоборот.
//!
//! bcrypt_verify — проверка пароля против хэша формата OpenBSD
//! ($2a$/$2b$/$2y$, любой cost): контрактный паритет с сервером (нативный
//! bcrypt-пакет, cost 12 в authService), KAT-векторы (tests/bcrypt_vector.txt,
//! OpenBSD/crypt_blowfish) обязаны верифицироваться одинаково ядром и сервером.
//!
//! Double Ratchet (forward secrecy) — модуль ratchet (этап 7 ROADMAP_NATIVE,
//! прототип: skip-store внеочередных сообщений реализован; wire-формат
//! RatchetMessage определён — to_wire/from_wire: header || nonce || ciphertext).
//! Node.js-биндинги (napi-rs) — модуль node (src/node.rs): generateKeypair,
//! sealForRecipients, openSealed, keySize/nonceSize. UniFFI-биндинги Swift/Kotlin — модуль uniffi_iface (src/uniffi_iface.rs,
//! feature uniffi-bind). Дальнейшие шаги: интеграция Double Ratchet в клиенты,
//! опционально ГОСТ СКЗИ для сертифицированного контура.

use crypto_box::aead::{Aead, AeadCore, OsRng};
use crypto_box::{Nonce, PublicKey, SalsaBox, SecretKey};

pub mod ratchet;
pub use ratchet::{RatchetMessage, RatchetState};

// Серверные горячие пути (этап 6 ROADMAP_NATIVE.md): CPU-bound операции
// (первая — SHA-256 checksum) для .node-аддона сервера и нативных клиентов.
pub mod hotpath;
pub use hotpath::{sha256_hex, sha256_verify};

// Node.js-биндинги (napi-rs, этап 2 ROADMAP_NATIVE.md). Опциональная feature
// napi-bind (default, см. [features] в Cargo.toml): юнит-тесты ядра линкуются
// без napi-символов (их в рантайме даёт только процесс Node — napi-rs
// issue #1099, дистрибутив Node не содержит libnode.so), поэтому CI гоняет
// cargo test --no-default-features; компиляция node.rs и его #[cfg(test)]-
// кода проверяется отдельным cargo check --tests (type-check без линковки).
#[cfg(feature = "napi-bind")]
pub mod node;

// UniFFI-биндинги (Swift/Kotlin, этап 2 ROADMAP_NATIVE.md): модуль
// uniffi_iface (src/uniffi_iface.rs), опциональная feature uniffi-bind
// (НЕ default — как и napi-bind, отдельно от обычных прогонов ядра;
// в отличие от napi, uniffi-обёртки линкуются в тестовый бинарник чисто:
// metadata-функции — обычный Rust без внешнего рантайма, их гоняет джоба
// CI uniffi-bindings). setup_scaffolding! обязателен в корне крейта:
// эмитит metadata-символы, по которым uniffi-bindgen (library mode)
// генерирует Swift/Kotlin-обвязку.
#[cfg(feature = "uniffi-bind")]
uniffi::setup_scaffolding!();

#[cfg(feature = "uniffi-bind")]
pub mod uniffi_iface;

/// Размер приватного/публичного ключа X25519.
pub const KEY_SIZE: usize = 32;
/// Размер nonce XSalsa20 (24 байта, как в NaCl).
pub const NONCE_SIZE: usize = 24;

/// Ошибки ядра. Отдельный тип вместо проброса aead::Error: его нельзя
/// сконструировать вне крейта aead, а вызывающим (биндингам) нужен свой enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CoreError {
    /// Ошибка шифрования/расшифровки (AEAD).
    Aead,
    /// Ни один бокс конверта не расшифрован нашей парой ключей.
    NoBoxForRecipient,
    /// Ratchet: нет ключа собеседника/цепочки (нужно получить первое сообщение).
    NotInitialized,
    /// Ratchet: replay, ключ уже израсходован или n за пределами лимитов
    /// skip-store (MAX_SKIP / MAX_SKIPPED_KEYS).
    OutOfOrder,
    /// Ratchet: заголовок неверной длины.
    BadHeader,
    /// Неверный формат bcrypt-хэша (bcrypt_verify).
    BadHash,
}

impl From<crypto_box::aead::Error> for CoreError {
    fn from(_: crypto_box::aead::Error) -> Self {
        CoreError::Aead
    }
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::Aead => write!(f, "aead encrypt/decrypt failed"),
            CoreError::NoBoxForRecipient => {
                write!(f, "no box in envelope decryptable by this keypair")
            }
            CoreError::NotInitialized => {
                write!(f, "ratchet not initialized (no remote key / chain)")
            }
            CoreError::OutOfOrder => write!(f, "ratchet message out of order"),
            CoreError::BadHeader => write!(f, "ratchet header has invalid length"),
            CoreError::BadHash => write!(f, "invalid bcrypt hash string"),
        }
    }
}

impl std::error::Error for CoreError {}

/// Пара ключей устройства. Секретный ключ НИКОГДА не покидает устройство —
/// наружу отдаётся только public_key (см. E2E-контракт, модель UserKey).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct KeyPair {
    pub public_key: [u8; KEY_SIZE],
    pub secret_key: [u8; KEY_SIZE],
}

/// Сгенерировать новую пару X25519 (для устройства или эфемерную).
pub fn generate_keypair() -> KeyPair {
    let mut rng = OsRng;
    let secret = SecretKey::generate(&mut rng);
    let public = secret.public_key();
    let mut kp = KeyPair {
        public_key: [0u8; KEY_SIZE],
        secret_key: [0u8; KEY_SIZE],
    };
    kp.public_key.copy_from_slice(public.as_bytes());
    // as_ref() нейтрален к форме возврата to_bytes ([u8;32] или &[u8;32]):
    // в обоих случаях получаем &[u8] для copy_from_slice.
    let secret_bytes = secret.to_bytes();
    kp.secret_key.copy_from_slice(secret_bytes.as_ref());
    kp
}

/// Зашифрованное сообщение: эфемерный публичный ключ + nonce + боксы по одному
/// на каждого получателя (включая бокс отправителя — чтобы его другие
/// устройства могли прочитать).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SealedMessage {
    pub epk: [u8; KEY_SIZE],
    pub nonce: [u8; NONCE_SIZE],
    pub boxes: Vec<Vec<u8>>,
}

/// Зашифровать plaintext для списка публичных ключей получателей.
///
/// Каждому получателю — свой бокс (один nonce под одной эфемерной парой:
/// разные получатели = разные Diffie-Hellman ключи, nonce не переиспользуется
/// с одним ключом). Статический ключ отправителя не участвует: epk эфемерный.
pub fn seal_for_recipients(
    plaintext: &[u8],
    recipient_public_keys: &[[u8; KEY_SIZE]],
) -> Result<SealedMessage, CoreError> {
    let mut rng = OsRng;
    let ephemeral_secret = SecretKey::generate(&mut rng);
    let ephemeral_public = ephemeral_secret.public_key();
    let nonce = SalsaBox::generate_nonce(&mut rng);

    let mut sealed = SealedMessage {
        epk: [0u8; KEY_SIZE],
        nonce: [0u8; NONCE_SIZE],
        boxes: Vec::with_capacity(recipient_public_keys.len()),
    };
    sealed.epk.copy_from_slice(ephemeral_public.as_bytes());
    sealed.nonce.copy_from_slice(nonce.as_slice());

    for recipient in recipient_public_keys {
        let recipient_public = PublicKey::from(*recipient);
        let box_ = SalsaBox::new(&recipient_public, &ephemeral_secret);
        sealed.boxes.push(box_.encrypt(&nonce, plaintext)?);
    }

    Ok(sealed)
}

/// Расшифровать SealedMessage своим (public, secret): перебирает боксы и
/// возвращает plaintext первого, который расшифровывается нашей парой.
/// my_public зарезервирован для маппинга userId → box (когда конверт
/// сериализуется с именованными боксами); при поиске перебором он не нужен.
pub fn open_sealed(
    sealed: &SealedMessage,
    _my_public: &[u8; KEY_SIZE],
    my_secret: &[u8; KEY_SIZE],
) -> Result<Vec<u8>, CoreError> {
    let my_secret = SecretKey::from(*my_secret);
    let sender_ephemeral = PublicKey::from(sealed.epk);
    let nonce = Nonce::from(sealed.nonce);

    let box_ = SalsaBox::new(&sender_ephemeral, &my_secret);
    for ciphertext in &sealed.boxes {
        if let Ok(plaintext) = box_.decrypt(&nonce, ciphertext.as_slice()) {
            return Ok(plaintext);
        }
    }

    Err(CoreError::NoBoxForRecipient)
}

/// Батч-расшифровка страницы конвертов (длинные чаты): тот же контракт,
/// что open_sealed, но один вызов на окно сообщений — клиенты больше не
/// дёргают FFI/IPC на каждое сообщение (кнопка «Показать более старые»
/// расшифровывает страницу одним вызовом). Чужой ключ/битый конверт —
/// Err в соответствующем элементе, остальные элементы батча не страдают.
pub fn open_sealed_batch(
    sealeds: &[SealedMessage],
    my_public: &[u8; KEY_SIZE],
    my_secret: &[u8; KEY_SIZE],
) -> Vec<Result<Vec<u8>, CoreError>> {
    sealeds
        .iter()
        .map(|sealed| open_sealed(sealed, my_public, my_secret))
        .collect()
}

/// Raw X25519-DH (RFC 7748): общий секрет из приватного ключа этой стороны
/// и публичного ключа собеседника. Симметричен: x25519_dh(a, B) ==
/// x25519_dh(b, A). Скаляр клампится явно по RFC 7748 (сброс младших трёх
/// бит, установка бита 254) — поведение не зависит от семантики
/// StaticSecret::from крейта x25519-dalek, а клампинг идемпотентен.
/// Назначение (этап 7): shared secret из identity-ключей реестра UserKey —
/// вход RatchetState::init_initiator/init_responder при склейке Double
/// Ratchet с клиентами.
///
/// Честно: all-zero выход (малопорядковый публичный ключ) здесь не
/// отклоняется — ключи реестра генерируются generate_keypair и
/// малопорядковыми быть не могут; враждебный ключ даст нулевой ss, сессия
/// на нём честно падает на первом decrypt. Проверка — на границе вызова.
pub fn x25519_dh(my_secret: &[u8; KEY_SIZE], their_public: &[u8; KEY_SIZE]) -> [u8; KEY_SIZE] {
    let mut clamped = *my_secret;
    clamped[0] &= 248;
    clamped[31] &= 127;
    clamped[31] |= 64;
    let secret = x25519_dalek::StaticSecret::from(clamped);
    let public = x25519_dalek::PublicKey::from(*their_public);
    let shared = secret.diffie_hellman(&public);
    let mut out = [0u8; KEY_SIZE];
    out.copy_from_slice(shared.as_bytes());
    out
}

/// Проверить пароль против bcrypt-хэша формата OpenBSD ($2a$/$2b$/$2y$,
/// любой cost). Контракт этапа 2 ROADMAP_NATIVE: сервер хэширует пароли
/// нативным bcrypt-пакетом с cost 12 (authService), ядро даёт ту же
/// verify-семантику для нативных клиентов и горячих путей. KAT-векторы
/// (tests/bcrypt_vector.txt, OpenBSD/crypt_blowfish, public domain) обязаны
/// верифицироваться одинаково обеими реализациями: core/tests/
/// bcrypt_vector.rs и server/tests/bcryptInterop.test.js.
/// Возвращает Ok(false) при неверном пароле, Err(BadHash) на битом хэше.
pub fn bcrypt_verify(password: &str, hash: &str) -> Result<bool, CoreError> {
    bcrypt::verify(password, hash).map_err(|_| CoreError::BadHash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_multiple_recipients() {
        let alice = generate_keypair();
        let bob = generate_keypair();
        let plaintext = b"Patient: good evening, doctor!";

        let sealed =
            seal_for_recipients(plaintext, &[alice.public_key, bob.public_key]).unwrap();

        assert_eq!(sealed.boxes.len(), 2);
        assert_ne!(sealed.epk, [0u8; KEY_SIZE]);

        let for_alice =
            open_sealed(&sealed, &alice.public_key, &alice.secret_key).unwrap();
        let for_bob = open_sealed(&sealed, &bob.public_key, &bob.secret_key).unwrap();
        assert_eq!(for_alice, plaintext.to_vec());
        assert_eq!(for_bob, plaintext.to_vec());
    }

    #[test]
    fn wrong_key_fails() {
        let alice = generate_keypair();
        let mallory = generate_keypair();
        let sealed = seal_for_recipients(b"secret", &[alice.public_key]).unwrap();

        assert_eq!(
            open_sealed(&sealed, &mallory.public_key, &mallory.secret_key),
            Err(CoreError::NoBoxForRecipient)
        );
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let alice = generate_keypair();
        let mut sealed = seal_for_recipients(b"secret", &[alice.public_key]).unwrap();
        sealed.boxes[0][0] ^= 0xFF;
        assert_eq!(
            open_sealed(&sealed, &alice.public_key, &alice.secret_key),
            Err(CoreError::NoBoxForRecipient)
        );
    }

    #[test]
    fn empty_recipients_is_empty_envelope() {
        let sealed = seal_for_recipients(b"x", &[]).unwrap();
        assert!(sealed.boxes.is_empty());
        assert_eq!(
            open_sealed(&sealed, &[0u8; KEY_SIZE], &[0u8; KEY_SIZE]),
            Err(CoreError::NoBoxForRecipient)
        );
    }

    #[test]
    fn batch_open_mixed_page() {
        let alice = generate_keypair();
        let bob = generate_keypair();
        let s1 =
            seal_for_recipients(b"page one", &[alice.public_key, bob.public_key]).unwrap();
        let s2 = seal_for_recipients(b"page two", &[alice.public_key]).unwrap();
        let s3 = seal_for_recipients(b"not for alice", &[bob.public_key]).unwrap();
        let out = open_sealed_batch(&[s1, s2, s3], &alice.public_key, &alice.secret_key);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].as_ref().unwrap().as_slice(), b"page one");
        assert_eq!(out[1].as_ref().unwrap().as_slice(), b"page two");
        assert!(out[2].is_err());
        let for_bob = open_sealed_batch(&[s1, s3], &bob.public_key, &bob.secret_key);
        assert_eq!(for_bob[0].as_ref().unwrap().as_slice(), b"page one");
        assert!(for_bob[1].is_err());
    }

    /// KAT RFC 7748 §6.1 (DH-вектор Curve25519): публичный ключ стороны
    /// X25519(priv, basepoint 9) — согласованность с generate_keypair;
    /// DH-симметрия на сгенерированных парах.
    #[test]
    fn x25519_dh_rfc7748_kat_and_symmetry() {
        fn hex32(s: &str) -> [u8; KEY_SIZE] {
            let mut out = [0u8; KEY_SIZE];
            for i in 0..KEY_SIZE {
                out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
            }
            out
        }
        let a = hex32("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
        let a_pub = hex32("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
        let b = hex32("5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb");
        let b_pub = hex32("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");
        let k = hex32("4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742");
        let mut basepoint = [0u8; KEY_SIZE];
        basepoint[0] = 9;
        assert_eq!(x25519_dh(&a, &basepoint), a_pub);
        assert_eq!(x25519_dh(&b, &basepoint), b_pub);
        assert_eq!(x25519_dh(&a, &b_pub), k);
        assert_eq!(x25519_dh(&b, &a_pub), k);
        let ka = generate_keypair();
        let kb = generate_keypair();
        assert_eq!(
            x25519_dh(&ka.secret_key, &kb.public_key),
            x25519_dh(&kb.secret_key, &ka.public_key)
        );
    }
}
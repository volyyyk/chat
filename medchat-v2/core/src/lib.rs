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
//! Double Ratchet (forward secrecy) — модуль ratchet (этап 7 ROADMAP_NATIVE,
//! прототип: skip-store внеочередных сообщений реализован; wire-формат
//! RatchetMessage определён — to_wire/from_wire: header || nonce || ciphertext).
//! Node.js-биндинги (napi-rs) — модуль node (src/node.rs): generateKeypair,
//! sealForRecipients, openSealed, keySize/nonceSize. Дальнейшие шаги:
//! UniFFI-биндинги для Swift/Kotlin, интеграция Double Ratchet в клиенты,
//! опционально ГОСТ СКЗИ для сертифицированного контура.

use crypto_box::aead::{Aead, AeadCore, OsRng};
use crypto_box::{Nonce, PublicKey, SalsaBox, SecretKey};

pub mod ratchet;
pub use ratchet::{RatchetMessage, RatchetState};

// Node.js-биндинги (napi-rs, этап 2 ROADMAP_NATIVE.md).
pub mod node;

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
        }
    }
}

impl std::error::Error for CoreError {}

/// Пара ключей устройства. Секретный ключ НИКОГДА не покидает устройство —
/// наружу отдаётся только public_key (см. E2E-контракт, модель UserKey).
#[derive(Debug, Clone, PartialEq, Eq)]
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
}

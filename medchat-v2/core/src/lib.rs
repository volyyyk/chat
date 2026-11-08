//! medchat-core: криптографическое ядро MedChat (этап 2 ROADMAP_NATIVE.md).
//!
//! Примитивы сквозного E2E-шифрования сообщений. Формат конверта совместим с
//! мобильным клиентом (tweetnacl, x25519-box) и серверным контрактом
//! (docs/readme_for_AI.md, раздел «E2E-контракт»):
//!
//! { v: 1, alg: "x25519-box", epk: <ephemeral pubkey>, nonce: <24 байта>,
//!   boxes: { [userId]: <ciphertext> } }
//!
//! Бинарная раскладка одного бокса (base64-независимая, та же, что у tweetnacl):
//!   ciphertext = XSalsa20-Poly1305(plaintext) с MAC, зашитым Poly1305.
//!
//! Дальнейшие шаги (см. ROADMAP_NATIVE.md): Double Ratchet (forward secrecy),
//! napi-rs-биндинги для Node-сервера, UniFFI-биндинги для Swift/Kotlin,
//! опционально ГОСТ СКЗИ для сертифицированного контура.

use crypto_box::aead::Aead;
use crypto_box::{
    aead::OsRng, Box as CryptoBox, Generate, Nonce, PublicKey, SecretKey,
};

/// Размер приватного/публичного ключа X25519.
pub const KEY_SIZE: usize = 32;
/// Размер nonce XSalsa20 (24 байта, как в NaCl).
pub const NONCE_SIZE: usize = 24;

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
    let public = PublicKey::from(&secret);
    let mut kp = KeyPair {
        public_key: [0u8; KEY_SIZE],
        secret_key: [0u8; KEY_SIZE],
    };
    kp.public_key.copy_from_slice(public.as_bytes());
    kp.secret_key.copy_from_slice(secret.as_bytes());
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
/// разные получатели, разные Diffie-Hellman ключи, nonce не переиспользуется
/// с одним ключом). Отправитель не участвует в шифровании своим статическим
/// ключом: epk эфемерный, как в модели «sealed box + own copy».
pub fn seal_for_recipients(
    plaintext: &[u8],
    recipient_public_keys: &[[u8; KEY_SIZE]],
) -> Result<SealedMessage, crypto_box::aead::Error> {
    let mut rng = OsRng;
    let ephemeral_secret = SecretKey::generate(&mut rng);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let nonce = crypto_box::generate_nonce(&mut rng);

    let mut sealed = SealedMessage {
        epk: [0u8; KEY_SIZE],
        nonce: [0u8; NONCE_SIZE],
        boxes: Vec::with_capacity(recipient_public_keys.len()),
    };
    sealed.epk.copy_from_slice(ephemeral_public.as_bytes());
    sealed.nonce.copy_from_slice(nonce.as_slice());

    for recipient in recipient_public_keys {
        let recipient_public = PublicKey::from(*recipient);
        let box_ = CryptoBox::new(&recipient_public, &ephemeral_secret);
        // Транслируем ошибку aead, чтобы типы совпадали.
        let nonce_ref: &Nonce = &nonce;
        sealed.boxes.push(box_.seal(nonce_ref, plaintext)?);
    }

    Ok(sealed)
}

/// Расшифровать SealedMessage своим (public, secret): перебирает боксы и
/// возвращает plaintext первого, который расшифровывается нашей парой.
pub fn open_sealed(
    sealed: &SealedMessage,
    my_public: &[u8; KEY_SIZE],
    my_secret: &[u8; KEY_SIZE],
) -> Result<Vec<u8>, crypto_box::aead::Error> {
    let my_public = PublicKey::from(*my_public);
    let my_secret = SecretKey::from(*my_secret);
    let sender_ephemeral = PublicKey::from(sealed.epk);
    let nonce = Nonce::from(sealed.nonce);

    let box_ = CryptoBox::new(&sender_ephemeral, &my_secret);
    let mut last_err = None;
    for ciphertext in &sealed.boxes {
        match box_.open(&nonce, ciphertext.as_slice()) {
            Ok(plaintext) => return Ok(plaintext),
            Err(e) => last_err = Some(e),
        }
    }

    // Ни один бокс не расшифровался: сообщение не для этой пары ключей
    // (или повреждено). my_public используется вызывающей стороной для
    // выбора бокса при маппинге userId → box.
    let _ = my_public;
    Err(last_err.unwrap_or(crypto_box::aead::Error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_multiple_recipients() {
        let alice = generate_keypair();
        let bob = generate_keypair();
        let plaintext = b"Пациент: добрый вечер, доктор!";

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

        assert!(open_sealed(&sealed, &mallory.public_key, &mallory.secret_key).is_err());
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let alice = generate_keypair();
        let mut sealed = seal_for_recipients(b"secret", &[alice.public_key]).unwrap();
        sealed.boxes[0][0] ^= 0xFF;
        assert!(open_sealed(&sealed, &alice.public_key, &alice.secret_key).is_err());
    }

    #[test]
    fn empty_recipients_is_empty_envelope() {
        let sealed = seal_for_recipients(b"x", &[]).unwrap();
        assert!(sealed.boxes.is_empty());
        assert!(open_sealed(&sealed, &[0u8; KEY_SIZE], &[0u8; KEY_SIZE]).is_err());
    }
}

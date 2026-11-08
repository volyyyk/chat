//! Node.js-биндинги ядра (napi-rs, этап 2 ROADMAP_NATIVE.md).
//!
//! Тонкие обёртки над примитивами lib.rs. JS-имена camelCase (генерирует
//! napi-rs): generateKeypair, sealForRecipients, openSealed, keySize,
//! nonceSize; JsKeyPair → { publicKey, secretKey }, JsSealedMessage →
//! { epk, nonce, boxes }.
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
//! Сборка .node-артефакта — napi-cli (napi build); джоба core-tests в CI
//! проверяет компиляцию биндингов и юнит-тесты через cargo test
//! (artifact-сборка .node в CI пока не настроена — задокументировано).

use napi::bindgen_prelude::{Buffer, Result};
use napi::{Error as NapiError, Status};
use napi_derive::napi;

use crate::{
    open_sealed as core_open, seal_for_recipients as core_seal, CoreError, SealedMessage,
    KEY_SIZE, NONCE_SIZE,
};

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
        let err = open_sealed(
            Buffer::from(vec![0u8; 31]), // epk не той длины
            Buffer::from(vec![0u8; NONCE_SIZE]),
            vec![],
            alice.public_key,
            alice.secret_key,
        )
        .unwrap_err();
        assert!(err.to_string().contains("epk must be 32 bytes, got 31"));
    }
}

//! Кросс-платформенный контрактный тест: known-answer векторы AES-256-GCM.
//!
//! AES-256-GCM — AEAD каждого сообщения Double Ratchet (ratchet.rs) и
//! at-rest-путь серверного cryptoService. Крейт aes-gcm 0.11 обязан
//! воспроизводить эталонные ct и tag байт-в-байт (раскладка ct || tag —
//! та же, что в wire-формате ratchet). Вторая сторона контракта — Node.js
//! crypto (server/tests/coreAesGcm.test.js, джоба CI server-tests) на той
//! же фикстуре aes_gcm_vector.hex. Закрывает пункт DoD Этапа 2
//! docs/ROADMAP_NATIVE.md: тест-векторы совпадают между реализациями
//! (NaCl box закрыт 1ce9516, здесь — AES-GCM-путь).

use aes_gcm::aead::{Aead, Nonce, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};

fn unhex(s: &str) -> Vec<u8> {
    let clean: String = s
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();
    assert_eq!(clean.len() % 2, 0, "hex length must be even");
    (0..clean.len() / 2)
        .map(|i| u8::from_str_radix(&clean[i * 2..i * 2 + 2], 16).expect("hex digit"))
        .collect()
}

fn fixture() -> Vec<(String, Vec<u8>)> {
    let raw = include_str!("aes_gcm_vector.hex");
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            // split_once('=') вместо " = ": в фикстуре есть пустые значения
            // ("v1_pt =" — пустой plaintext/AAD первого вектора).
            let (key, value) = line.split_once('=')?;
            Some((key.trim().to_string(), unhex(value.trim())))
        })
        .collect()
}

fn field(name: &str) -> Vec<u8> {
    fixture()
        .into_iter()
        .find(|(k, _)| k == name)
        .unwrap_or_else(|| panic!("missing field {} in fixture", name))
        .1
}

/// Зашифровать эталонные векторы: вывод aes-gcm (ct || tag) обязан
/// совпасть с фикстурой байт-в-байт; обратное расшифрование — вернуть pt.
#[test]
fn aes256gcm_matches_known_answer_vectors() {
    for prefix in ["v1", "v2", "v3"] {
        let key = field(&format!("{}_key", prefix));
        let nonce = field(&format!("{}_nonce", prefix));
        let pt = field(&format!("{}_pt", prefix));
        let aad = field(&format!("{}_aad", prefix));
        let ct = field(&format!("{}_ct", prefix));
        let tag = field(&format!("{}_tag", prefix));

        assert_eq!(key.len(), 32, "{}: key size", prefix);
        assert_eq!(nonce.len(), 12, "{}: nonce size", prefix);
        assert_eq!(tag.len(), 16, "{}: tag size", prefix);
        assert_eq!(ct.len(), pt.len(), "{}: ct size == pt size", prefix);

        let cipher = Aes256Gcm::new_from_slice(&key).expect("key");
        // aead 0.6: nonce типизирован (Nonce<Aes256Gcm>), передаётся по ссылке.
        let n12: Nonce<Aes256Gcm> = Nonce::<Aes256Gcm>::try_from(nonce.as_slice()).expect("nonce");
        let sealed = cipher
            .encrypt(
                &n12,
                Payload {
                    msg: pt.as_slice(),
                    aad: aad.as_slice(),
                },
            )
            .expect("encrypt");

        // раскладка AEAD-сообщения: ct || tag (как в ratchet wire).
        let mut expected = ct.clone();
        expected.extend_from_slice(&tag);
        assert_eq!(
            sealed, expected,
            "{}: aes-gcm output must match the vector byte-for-byte",
            prefix
        );
        assert_eq!(sealed.len(), pt.len() + 16, "{}: layout ct||tag", prefix);

        let opened = cipher
            .decrypt(
                &n12,
                Payload {
                    msg: sealed.as_slice(),
                    aad: aad.as_slice(),
                },
            )
            .expect("decrypt");
        assert_eq!(opened, pt, "{}: roundtrip", prefix);
    }
}

/// Подделанный тег (или шифртекст) обязан отвергаться AEAD.
#[test]
fn aes256gcm_rejects_tampered_tag() {
    let key = field("v2_key");
    let nonce = field("v2_nonce");
    let aad = field("v2_aad");
    let ct = field("v2_ct");
    let tag = field("v2_tag");

    let cipher = Aes256Gcm::new_from_slice(&key).expect("key");
    let mut forged = ct.clone();
    forged.extend_from_slice(&tag);
    let last = forged.len() - 1;
    forged[last] ^= 0x01;

    let n12: Nonce<Aes256Gcm> = Nonce::<Aes256Gcm>::try_from(nonce.as_slice()).expect("nonce");
    let result = cipher.decrypt(
        &n12,
        Payload {
            msg: forged.as_slice(),
            aad: aad.as_slice(),
        },
    );
    assert!(result.is_err(), "tampered tag must be rejected");
}

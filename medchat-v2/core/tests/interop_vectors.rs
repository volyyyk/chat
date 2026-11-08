//! Кросс-платформенный контрактный тест: канонический вектор NaCl crypto_box.
//!
//! Доказывает, что криптографическое ядро (SalsaBox = X25519 +
//! XSalsa20-Poly1305, крейт crypto_box 0.9) воспроизводит эталонный вывод
//! NaCl байт-в-байт. Вторая сторона контракта — tweetnacl (библиотека
//! мобильного клиента), она проверяется на той же фикстуре в
//! server/tests/coreInterop.test.js. Это закрывает пункт DoD Этапа 2
//! docs/ROADMAP_NATIVE.md: тест-векторы совпадают между реализациями.

use crypto_box::aead::Aead;
use crypto_box::{Nonce, PublicKey, SalsaBox, SecretKey};

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
    let raw = include_str!("nacl_box_vector.hex");
    raw.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once(" = ")?;
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

fn arr32(v: &[u8]) -> [u8; 32] {
    let mut a = [0u8; 32];
    a.copy_from_slice(v);
    a
}

fn arr24(v: &[u8]) -> [u8; 24] {
    let mut a = [0u8; 24];
    a.copy_from_slice(v);
    a
}

/// Шифрование: c = crypto_box(m, nonce, bob_pk, alice_sk) — как в эталоне
/// NaCl. Rust-ядро обязано выдать ровно тот же шифртекст (147 байт).
#[test]
fn rust_core_matches_canonical_nacl_box_vector() {
    let nonce_bytes = field("nonce");
    let m = field("m");
    let expected_c = field("c");
    assert_eq!(m.len(), 131);
    assert_eq!(expected_c.len(), 147);

    let nonce = Nonce::from(arr24(&nonce_bytes));
    let sender = SecretKey::from(arr32(&field("alice_sk")));
    let recipient = PublicKey::from(arr32(&field("bob_pk")));

    let salsa = SalsaBox::new(&recipient, &sender);
    let ciphertext = salsa.encrypt(&nonce, m.as_slice()).expect("encrypt");
    assert_eq!(
        ciphertext, expected_c,
        "Rust core must match the reference NaCl vector byte-for-byte"
    );
}

/// Расшифровка: Bob открывает шифртекст своим секретным ключом
/// и публичным ключом Alice — должен получиться исходный текст (131 байт).
#[test]
fn rust_core_opens_canonical_nacl_box_vector() {
    let nonce_bytes = field("nonce");
    let m = field("m");
    let c = field("c");

    let nonce = Nonce::from(arr24(&nonce_bytes));
    let recipient_sk = SecretKey::from(arr32(&field("bob_sk")));
    let sender_pk = PublicKey::from(arr32(&field("alice_pk")));

    let opened = SalsaBox::new(&sender_pk, &recipient_sk)
        .decrypt(&nonce, c.as_slice())
        .expect("decrypt");
    assert_eq!(opened, m);
}

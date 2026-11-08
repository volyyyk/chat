//! Контрактные векторы bcrypt (этап 2 ROADMAP_NATIVE.md).
//!
//! KAT-векторы из тестов OpenBSD/crypt_blowfish (Solar Designer, public
//! domain) на общей фикстуре bcrypt_vector.txt: ту же фикстуру верифицирует
//! jest-сторона (server/tests/bcryptInterop.test.js, нативный bcrypt-пакет
//! сервера, cost 12 в authService) — обе реализации обязаны согласиться
//! на всех векторах (паритет ядра и сервера).

use std::collections::HashMap;

use medchat_core::{bcrypt_verify, CoreError};

const FIXTURE: &str = include_str!("bcrypt_vector.txt");

/// Формат «ключ = значение»: значение — всё после первого «= » без trim
/// (пароль v4 содержит пробелы внутри). lines() срезает возможный \r.
fn fields() -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in FIXTURE.lines() {
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if let Some((key, value)) = line.split_once("= ") {
            map.insert(key.trim().to_string(), value.to_string());
        }
    }
    map
}

#[test]
fn bcrypt_kat_vectors_verify() {
    let map = fields();
    for n in 1..=4u8 {
        let password = map
            .get(&format!("v{}_password", n))
            .expect("password в фикстуре");
        let hash = map
            .get(&format!("v{}_hash", n))
            .expect("hash в фикстуре");
        assert!(
            bcrypt_verify(password, hash).expect("корректный bcrypt-хэш"),
            "KAT v{} обязан верифицироваться",
            n
        );
    }
}

#[test]
fn bcrypt_wrong_password_rejected_and_bad_hash_is_error() {
    let map = fields();
    let hash = &map["v1_hash"];

    // Неверный пароль: Ok(false), а не ошибка.
    assert_eq!(bcrypt_verify("wrong-password", hash), Ok(false));

    // Битый формат хэша: различимая ошибка, а не просто false.
    assert_eq!(
        bcrypt_verify("U*U", "not-a-bcrypt-hash"),
        Err(CoreError::BadHash)
    );
}
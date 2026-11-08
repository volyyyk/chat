//! Серверные горячие пути (этап 6 ROADMAP_NATIVE.md): CPU-bound операции,
//! переносимые с Node на Rust-ядро, чтобы разгружать event-loop сервера.
//!
//! SHA-256 checksum — первый перенос (карта §1: «хэширование чексумм
//! файлов»): чексуммы бэкапов/файлов считаются синхронно в cdylib (.node),
//! Node-обёртка сервера вызывает нативную функцию и не тратит event-loop
//! на хэширование мегабайтных буферов.
//!
//! Криптографический примитив — sha2 (уже в дереве ядра: HMAC-SHA256
//! цепочек Double Ratchet), отдельной зависимости не появляется.
//! KAT-векторы FIPS 180-4 («abc», пустая строка) обязаны совпадать с
//! node:crypto байт-в-байт (проверяется napi-smoke.js).

use sha2::{Digest, Sha256};
use std::fmt::Write as _;

/// SHA-256 от буфера → hex (lowercase, 64 символа). Синхронная: под
/// большие буферы вызывается из worker-потока Node.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(64);
    for b in digest {
        let _ = write!(hex, "{:02x}", b);
    }
    hex
}

/// Сверить буфер с ожидаемым hex (case-insensitive, краевые пробелы
/// игнорируются): контроль целостности файлов/бэкапов одним вызовом.
pub fn sha256_verify(data: &[u8], expected_hex: &str) -> bool {
    let expected = expected_hex.trim().to_ascii_lowercase();
    sha256_hex(data) == expected
}

#[cfg(test)]
mod tests {
    use super::*;

    /// KAT FIPS 180-4: SHA-256("abc").
    #[test]
    fn sha256_kat_abc() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    /// KAT FIPS 180-4: SHA-256("") — пустой буфер тоже валидный путь.
    #[test]
    fn sha256_kat_empty() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    /// verify: точное совпадение, регистр, краевые пробелы, несовпадение.
    #[test]
    fn sha256_verify_matches_and_case_insensitive() {
        let data = b"MedChat hot path";
        let hex = sha256_hex(data);
        assert_eq!(hex.len(), 64);
        assert!(sha256_verify(data, &hex));
        assert!(sha256_verify(data, &hex.to_uppercase()));
        assert!(sha256_verify(data, &format!("  {}  ", hex)));
        assert!(!sha256_verify(data, "00"));
    }
}

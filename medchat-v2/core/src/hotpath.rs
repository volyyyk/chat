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
//!
//! Gzip-сжатие бэкапов — второй перенос (карта §1: «сжатие бэкапов»):
//! JSON бэкапа сжимается ДО шифрования (AES-шифротекст не сжимается)
//! в flate2 (miniz_oxide); формат — стандартный gzip (RFC 1952),
//! читается node:zlib и любым gunzip. Битый поток — Err, не паника.

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

/// Gzip-сжатие буфера (RFC 1952). Синхронная, CPU-bound: под большие
/// буферы вызывается из worker-потока Node; для бэкапов — ДО шифрования.
pub fn gzip_compress(data: &[u8]) -> Vec<u8> {
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    std::io::Write::write_all(&mut enc, data).expect("gzip write to Vec cannot fail");
    enc.finish().expect("gzip finish to Vec cannot fail")
}

/// Gzip-распаковка: Err для битого/несжатого потока — вызов из Node
/// получает исключение, а не падение процесса.
pub fn gzip_decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut dec = flate2::read::GzDecoder::new(data);
    let mut out = Vec::new();
    std::io::Read::read_to_end(&mut dec, &mut out)
        .map_err(|e| format!("invalid gzip stream: {}", e))?;
    Ok(out)
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

    /// Gzip roundtrip: типичный JSON бэкапа сжимается и восстанавливается.
    #[test]
    fn gzip_roundtrip_json() {
        let json = b"{\"kind\":\"MedChat backup\",\"dataTypes\":[\"chats\"]}".repeat(64);
        let packed = gzip_compress(&json);
        assert_eq!(gzip_decompress(&packed).unwrap(), json);
        // повторяющийся JSON реально сжимается
        assert!(packed.len() < json.len() / 4);
    }

    /// Gzip-заголовок RFC 1952 (1f 8b 08); пустой буфер тоже валиден.
    #[test]
    fn gzip_header_and_empty() {
        let packed = gzip_compress(b"");
        assert_eq!(&packed[..3], &[0x1f, 0x8b, 0x08]);
        assert_eq!(gzip_decompress(&packed).unwrap(), b"");
    }

    /// Битый/несжатый/обрезанный поток — Err, а не паника.
    #[test]
    fn gzip_decompress_invalid_is_err() {
        assert!(gzip_decompress(b"not gzip at all").is_err());
        let data = b"MedChat backup payload ".repeat(64);
        let mut truncated = gzip_compress(&data);
        truncated.truncate(truncated.len() / 2);
        assert!(gzip_decompress(&truncated).is_err());
    }
}

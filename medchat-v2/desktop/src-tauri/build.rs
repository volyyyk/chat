// build.rs — сборочный скрипт desktop-каркаса (Tauri 2, этап 5).
//
// Генерирует иконку приложения icons/icon.png ДО tauri_build::build():
// generate_context! (proc-макрос tauri-codegen) открывает иконки из
// bundle.icon с диска даже при bundle.active=false (иконка попадает в
// default_window_icon окна). Прогоны #113–#116: и без поля icon, и с
// ПУСТЫМ списком "icon": [] (bfe1dad) tauri подставляет ДЕФОЛТНЫЙ список
// путей (icons/icon.png, icons/32x32.png, ...) и паникует, если файла нет.
// Единственный надёжный вариант — непустой список с существующим файлом.
//
// PNG 32x32 RGBA генерируется кодом: канал коммита в репозиторий текстовый
// (push_files), бинарный ассет закоммитить нельзя; настоящие иконки
// установщиков этапа 5 лягут в репо иным каналом — генерация идёт ТОЛЬКО
// при отсутствии файла, существующую иконку build.rs не перезапишет.

use std::path::Path;

/// CRC-32 (PNG-чанки): отражённый полином 0xEDB88320, init/final XOR.
fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

/// Adler-32 (хвост zlib-потока в IDAT).
fn adler32(data: &[u8]) -> u32 {
    let mut a: u32 = 1;
    let mut b: u32 = 0;
    for &byte in data {
        a = (a + byte as u32) % 65521;
        b = (b + a) % 65521;
    }
    (b << 16) | a
}

/// PNG-чанк: длина (BE) || тип || данные || CRC32(тип || данные).
fn push_chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let mut crc_input = Vec::with_capacity(4 + data.len());
    crc_input.extend_from_slice(kind);
    crc_input.extend_from_slice(data);
    png.extend_from_slice(&crc_input);
    png.extend_from_slice(&crc32(&crc_input).to_be_bytes());
}

/// Тил #0E7490 (cyan-700), 32x32 RGBA. Raw-сканлайны (фильтр-байт 0 +
/// 32 пикселя RGBA на строку) сжимаются одним stored-deflate блоком
/// (4128 < 65535): zlib-поток валиден и без компрессии, декодер
/// generate_context! читает его штатно.
fn icon_png() -> Vec<u8> {
    const W: usize = 32;
    const H: usize = 32;
    const RGBA: [u8; 4] = [0x0E, 0x74, 0x90, 0xFF];

    let mut raw = Vec::with_capacity(H * (1 + W * 4));
    for _ in 0..H {
        raw.push(0);
        for _ in 0..W {
            raw.extend_from_slice(&RGBA);
        }
    }

    let mut idat = vec![0x78, 0x01]; // zlib CMF/FLG, без компрессии
    let len = raw.len() as u16; // 4128 < 65535 — один stored-блок
    idat.push(0x01); // BFINAL=1, BTYPE=00 (stored)
    idat.extend_from_slice(&len.to_le_bytes());
    idat.extend_from_slice(&(!len).to_le_bytes());
    idat.extend_from_slice(&raw);
    idat.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&(W as u32).to_be_bytes());
    ihdr.extend_from_slice(&(H as u32).to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]); // depth 8, RGBA, deflate, adaptive, no interlace
    push_chunk(&mut png, b"IHDR", &ihdr);
    push_chunk(&mut png, b"IDAT", &idat);
    push_chunk(&mut png, b"IEND", &[]);
    png
}

fn main() {
    // CWD build-скрипта — корень крейта (src-tauri): generate_context!
    // резолвит иконки относительно tauri.conf.json, пути совпадают.
    let icon = Path::new("icons").join("icon.png");
    if !icon.exists() {
        std::fs::create_dir_all("icons").expect("create src-tauri/icons");
        std::fs::write(&icon, icon_png()).expect("write icons/icon.png");
    }
    tauri_build::build()
}

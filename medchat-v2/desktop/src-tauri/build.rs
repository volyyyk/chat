// build.rs — сборочный скрипт desktop-каркаса (Tauri 2, этап 5).
//
// Генерирует иконки ДО tauri_build::build(): generate_context! (proc-макрос
// tauri-codegen) открывает ВСЕ файлы из bundle.icon с диска даже при
// bundle.active=false (иконка попадает в default_window_icon окна).
// Прогоны #113–#116: и без поля icon, и с ПУСТЫМ списком "icon": []
// (bfe1dad) tauri подставляет ДЕФОЛТНЫЙ список путей и паникует, если
// файла нет. Единственный надёжный вариант — непустой список с файлами.
//
// Этап 5, сборка установщиков: бандлеру нужны иконки с размерами в ИМЕНИ
// файла (deb раскладывает по hicolor-паттернам 32x32.png/128x128.png/
// 128x128@2x.png) и icon.ico для NSIS-установщика Windows. Канал коммита в
// репозиторий текстовый (push_files), бинарный ассет закоммитить нельзя:
// плейсхолдер-тил #0E7490 генерируется кодом ТОЛЬКО при отсутствии файла,
// существующие (настоящие) иконки build.rs не перезаписывает.

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

/// Тил #0E7490 (cyan-700), RGBA. Raw-сканлайны (фильтр-байт 0 + w*4 байта
/// пикселей на строку) сжимаются stored-deflate блоками по <=65535 байт:
/// 32x32 — один блок (4128), 128x128 — два (65664), 256x256 — пять
/// (262400). zlib-поток валиден и без компрессии, декодер generate_context!
/// и бандлер читают его штатно.
fn tile_png(w: u32, h: u32) -> Vec<u8> {
    const RGBA: [u8; 4] = [0x0E, 0x74, 0x90, 0xFF];

    let mut raw = Vec::with_capacity((h * (1 + w * 4)) as usize);
    for _ in 0..h {
        raw.push(0);
        for _ in 0..w {
            raw.extend_from_slice(&RGBA);
        }
    }

    let mut idat = vec![0x78, 0x01]; // zlib CMF/FLG, без компрессии
    let mut rest: &[u8] = &raw;
    loop {
        // stored-блок: максимум 65535 байт данных за блок
        let take = rest.len().min(65535);
        let (chunk, tail) = rest.split_at(take);
        let last = tail.is_empty();
        idat.push(if last { 0x01 } else { 0x00 }); // BFINAL, BTYPE=00 (stored)
        let len = take as u16;
        idat.extend_from_slice(&len.to_le_bytes());
        idat.extend_from_slice(&(!len).to_le_bytes());
        idat.extend_from_slice(chunk);
        rest = tail;
        if last {
            break;
        }
    }
    idat.extend_from_slice(&adler32(&raw).to_be_bytes());

    let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&w.to_be_bytes());
    ihdr.extend_from_slice(&h.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]); // depth 8, RGBA, deflate, adaptive, no interlace
    push_chunk(&mut png, b"IHDR", &ihdr);
    push_chunk(&mut png, b"IDAT", &idat);
    push_chunk(&mut png, b"IEND", &[]);
    png
}

/// icon.ico для NSIS-установщика Windows: классический ICO с ОДНОЙ записью
/// BMP 32x32 32bpp — ICONDIR (6) + ICONDIRENTRY (16) + BITMAPINFOHEADER
/// (40, biHeight = 64: XOR-маска + AND-маска) + пиксели BGRA снизу-вверх
/// (4096) + AND-маска 1bpp (4 байта на строку, 128). PNG-записи внутри ICO
/// официально допускаются только для 256x256 — не рискуем, пишем BMP.
fn icon_ico() -> Vec<u8> {
    const W: u32 = 32;
    const H: u32 = 32;

    let xor_size = W * H * 4; // 4096
    let and_size = H * 4; // 128: 32 бита на строку — 4 байта

    let mut bmp = Vec::with_capacity((40 + xor_size + and_size) as usize);
    bmp.extend_from_slice(&40u32.to_le_bytes()); // biSize
    bmp.extend_from_slice(&W.to_le_bytes()); // biWidth
    bmp.extend_from_slice(&(H * 2).to_le_bytes()); // biHeight: XOR + AND
    bmp.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    bmp.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    bmp.extend_from_slice(&0u32.to_le_bytes()); // biCompression = BI_RGB
    bmp.extend_from_slice(&xor_size.to_le_bytes()); // biSizeImage
    bmp.extend_from_slice(&[0u8; 16]); // разрешения/палитра — нули
    for _ in 0..W * H {
        bmp.extend_from_slice(&[0x90, 0x74, 0x0E, 0xFF]); // BGRA тила #0E7490
    }
    bmp.extend(std::iter::repeat(0u8).take(and_size as usize)); // AND-маска

    let mut ico = Vec::with_capacity(22 + bmp.len());
    ico.extend_from_slice(&[0, 0]); // reserved
    ico.extend_from_slice(&[1, 0]); // тип: icon
    ico.extend_from_slice(&[1, 0]); // одна запись
    ico.push(W as u8); // ширина
    ico.push(H as u8); // высота
    ico.push(0); // палитра
    ico.push(0); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // planes
    ico.extend_from_slice(&32u16.to_le_bytes()); // bpp
    ico.extend_from_slice(&(bmp.len() as u32).to_le_bytes()); // размер данных
    ico.extend_from_slice(&22u32.to_le_bytes()); // offset = 6 + 16
    ico.extend_from_slice(&bmp);
    ico
}

fn main() {
    // CWD build-скрипта — корень крейта (src-tauri): generate_context!
    // резолвит иконки относительно tauri.conf.json, пути совпадают.
    let icons = [
        ("icon.png", tile_png(32, 32)), // окно + общий бандлер
        ("32x32.png", tile_png(32, 32)), // deb: hicolor 32x32
        ("128x128.png", tile_png(128, 128)), // deb: hicolor 128x128
        ("128x128@2x.png", tile_png(256, 256)), // deb: hicolor 256x256 (Retina)
        ("icon.ico", icon_ico()), // NSIS (Windows)
    ];
    std::fs::create_dir_all("icons").expect("create src-tauri/icons");
    for (name, bytes) in icons {
        let path = Path::new("icons").join(name);
        if !path.exists() {
            std::fs::write(&path, bytes)
                .unwrap_or_else(|e| panic!("write icons/{}: {}", name, e));
        }
    }
    tauri_build::build()
}
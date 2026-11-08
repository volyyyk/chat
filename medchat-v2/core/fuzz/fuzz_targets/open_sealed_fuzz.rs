//! Fuzz-цель: расшифровка враждебного конверта (open_sealed).
//! Конверт приходит по сети (metadata.e2e) — парсер обязан отклонять
//! любой мусор без паники: Ok или Err, никогда не crash.

#![no_main]

use libfuzzer_sys::fuzz_target;
use medchat_core::{open_sealed, SealedMessage, KEY_SIZE, NONCE_SIZE};

fuzz_target!(|data: &[u8]| {
    // Минимум: epk (32) + nonce (24) + хотя бы один бокс.
    if data.len() < KEY_SIZE + NONCE_SIZE + 16 {
        return;
    }
    let mut epk = [0u8; KEY_SIZE];
    epk.copy_from_slice(&data[..KEY_SIZE]);
    let mut nonce = [0u8; NONCE_SIZE];
    nonce.copy_from_slice(&data[KEY_SIZE..KEY_SIZE + NONCE_SIZE]);

    // Остаток режем на «боксы» по 64 байта (последний — хвостовой).
    let rest = &data[KEY_SIZE + NONCE_SIZE..];
    let mut boxes_ = Vec::new();
    for chunk in rest.chunks(64) {
        boxes_.push(chunk.to_vec());
    }

    let sealed = SealedMessage {
        epk,
        nonce,
        boxes: boxes_,
    };

    // Фиксированный (детерминированный) ключ получателя: результат
    // значения не имеет — важна только устойчивость к панике.
    let my_public = [0u8; KEY_SIZE];
    let my_secret = [0u8; KEY_SIZE];
    let _ = open_sealed(&sealed, &my_public, &my_secret);
});

//! Fuzz-цель: wire-формат RatchetMessage (from_wire) + decrypt.
//! from_wire — граница формата (транспорт): произвольные байты должны
//! давать Err(BadHeader), не панику. Если формат валиден — прогоняем
//! через decrypt отвечающей стороны: любые ошибки допустимы.

#![no_main]

use libfuzzer_sys::fuzz_target;
use medchat_core::{KeyPair, RatchetMessage, RatchetState, KEY_SIZE};

fuzz_target!(|data: &[u8]| {
    if let Ok(msg) = RatchetMessage::from_wire(data) {
        // Отвечающая сторона на фиксированных детерминированных ключах.
        let bob_ratchet = KeyPair {
            public_key: [0u8; KEY_SIZE],
            secret_key: [1u8; KEY_SIZE],
        };
        let mut bob = RatchetState::init_responder(&[7u8; 32], bob_ratchet);
        let _ = bob.decrypt(&msg);
    }
});

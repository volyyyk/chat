//! Fuzz-цель: roundtrip произвольного plaintext через Double Ratchet.
//! Фиксированная детерминированная сессия: шифруем произвольный вход
//! (включая пустой) и обязаны получить его же обратно через wire —
//! падение assert = найденный баг состояния (счётчики/skip-store).

#![no_main]

use libfuzzer_sys::fuzz_target;
use medchat_core::{KeyPair, RatchetMessage, RatchetState, KEY_SIZE};

fuzz_target!(|data: &[u8]| {
    let bob_ratchet = KeyPair {
        public_key: [0u8; KEY_SIZE],
        secret_key: [1u8; KEY_SIZE],
    };
    let mut alice = RatchetState::init_initiator(&[7u8; 32], &bob_ratchet.public_key);
    let mut bob = RatchetState::init_responder(&[7u8; 32], bob_ratchet);

    let m = alice.encrypt(data).expect("initiator encrypt не падает");
    let wire = m.to_wire();
    let restored = RatchetMessage::from_wire(&wire).expect("wire roundtrip валиден");
    let pt = bob.decrypt(&restored).expect("roundtrip decrypt");
    assert_eq!(pt, data);
});

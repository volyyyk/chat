//! Fuzz-цель: roundtrip произвольного plaintext через Double Ratchet.
//! Шифруем произвольный вход (включая пустой) и обязаны получить его же
//! обратно через wire — падение assert = найденный баг состояния
//! (счётчики/skip-store).
//!
//! Урок прогона #105 (ci-logs/ci-fuzz.log): фиктивная пара
//! KeyPair{public_key:[0;32], secret_key:[1;32]} невалидна по построению —
//! public_key обязан быть x25519(secret_key), иначе DH-выходы сторон не
//! совпадают и decrypt отвечает Aead на любом входе (краш на первом же
//! прогоне, crash-файл с пустым входом — падение setup-блока цели,
//! а не баг данных). Пара Боба — generate_keypair(), как в юнит-тестах
//! ratchet.rs; фиксированным остаётся только shared_secret [7;32]:
//! для roundtrip-инварианта важна согласованность пары ключей,
//! а не её конкретные значения.

#![no_main]

use libfuzzer_sys::fuzz_target;
use medchat_core::{RatchetMessage, RatchetState};

fuzz_target!(|data: &[u8]| {
    let bob_ratchet = medchat_core::generate_keypair();
    let mut alice = RatchetState::init_initiator(&[7u8; 32], &bob_ratchet.public_key);
    let mut bob = RatchetState::init_responder(&[7u8; 32], bob_ratchet);

    let m = alice.encrypt(data).expect("initiator encrypt не падает");
    let wire = m.to_wire();
    let restored = RatchetMessage::from_wire(&wire).expect("wire roundtrip валиден");
    let pt = bob.decrypt(&restored).expect("roundtrip decrypt");
    assert_eq!(pt, data);
});

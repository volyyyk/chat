//! Бенчмарки крипто-пути medchat-core — этап 2 ROADMAP_NATIVE.md, DoD:
//! «бенчмарк ≥ x10 к Node на крипто-пути».
//!
//! Зеркальная Node-сторона: medchat-v2/server/bench/coreBench.js — те же
//! примитивы (tweetnacl-box мобильного клиента, Node crypto AES-256-GCM,
//! нативный bcrypt) на тех же payload и cost. Числа обеих сторон сводятся
//! в лог джобы core-bench (ci-logs/ci-bench.log): сравнение честное — один
//! раннер, одна серия, ops/s.
//!
//! Запуск: cargo bench --no-default-features (без napi-биндингов —
//! бенчмарки меряют ядро, а не обёртки).

use std::time::Duration;

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use medchat_core::{
    bcrypt_verify, generate_keypair, open_sealed, seal_for_recipients, RatchetMessage,
    RatchetState,
};

/// Типовое сообщение чата (30 байт) — тот же payload в coreBench.js.
const MSG: &[u8] = b"Patient: good evening, doctor!";

fn bench_envelope(c: &mut Criterion) {
    let alice = generate_keypair();
    let bob = generate_keypair();
    let carol = generate_keypair();

    let mut group = c.benchmark_group("x25519-box envelope");
    group.throughput(Throughput::Bytes(MSG.len() as u64));

    // Личный чат 1-на-1: запечатать конверт + открыть своим ключом.
    group.bench_function(BenchmarkId::new("seal+open", "1 recipient"), |b| {
        b.iter(|| {
            let sealed = seal_for_recipients(MSG, &[bob.public_key]).unwrap();
            open_sealed(&sealed, &bob.public_key, &bob.secret_key).unwrap()
        })
    });

    // Групповой чат: три бокса в конверте, открыть средним получателем.
    group.bench_function(BenchmarkId::new("seal+open", "3 recipients"), |b| {
        b.iter(|| {
            let sealed = seal_for_recipients(
                MSG,
                &[alice.public_key, bob.public_key, carol.public_key],
            )
            .unwrap();
            open_sealed(&sealed, &bob.public_key, &bob.secret_key).unwrap()
        })
    });

    // Только seal — путь отправителя без расшифровки.
    group.bench_function(BenchmarkId::new("seal", "1 recipient"), |b| {
        b.iter(|| seal_for_recipients(MSG, &[bob.public_key]).unwrap())
    });

    group.finish();
}

fn bench_ratchet(c: &mut Criterion) {
    // Живая сессия Double Ratchet как в ratchet.rs::tests::session():
    // инициатор + отвечающая сторона. Счётчики двигаются каждую итерацию,
    // память стабильна — сообщения идут по порядку, skip-store не растёт.
    let shared = [7u8; 32];
    let bob_ratchet = generate_keypair();
    let mut alice = RatchetState::init_initiator(&shared, &bob_ratchet.public_key);
    let mut bob = RatchetState::init_responder(&shared, bob_ratchet);

    let mut group = c.benchmark_group("double ratchet");
    group.throughput(Throughput::Bytes(MSG.len() as u64));

    // Полный цикл сообщения: KDF_CK-цепочка + AES-256-GCM + расшифровка.
    group.bench_function(BenchmarkId::new("encrypt+decrypt", "in-order"), |b| {
        b.iter(|| {
            let msg = alice.encrypt(MSG).unwrap();
            bob.decrypt(&msg).unwrap()
        })
    });

    // Транспортный путь: to_wire || from_wire || decrypt (wire-формат a43102d).
    group.bench_function(BenchmarkId::new("encrypt+wire+decrypt", "roundtrip"), |b| {
        b.iter(|| {
            let wire = alice.encrypt(MSG).unwrap().to_wire();
            let restored = RatchetMessage::from_wire(&wire).unwrap();
            bob.decrypt(&restored).unwrap()
        })
    });

    group.finish();
}

fn bench_bcrypt(c: &mut Criterion) {
    // cost 5 — KAT-вектор OpenBSD (tests/bcrypt_vector.txt, «U*U»);
    // cost 12 — production-режим authService сервера. Те же пароль/хэш
    // в coreBench.js.
    let hash5 = "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW";
    let hash12 = bcrypt::hash("Test1234!", 12).unwrap();

    let mut group = c.benchmark_group("bcrypt verify");
    // cost 12 — сотни мс на операцию: уменьшенная выборка, короткий прогон.
    group.sample_size(10);
    group.warm_up_time(Duration::from_millis(500));
    group.measurement_time(Duration::from_secs(2));

    group.bench_function(BenchmarkId::new("verify", "cost 5 (KAT)"), |b| {
        b.iter(|| bcrypt_verify("U*U", hash5).unwrap())
    });
    group.bench_function(BenchmarkId::new("verify", "cost 12 (production)"), |b| {
        b.iter(|| bcrypt_verify("Test1234!", &hash12).unwrap())
    });

    group.finish();
}

criterion_group!(benches, bench_envelope, bench_ratchet, bench_bcrypt);
criterion_main!(benches);
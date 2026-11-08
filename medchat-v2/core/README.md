# medchat-core — криптографическое ядро MedChat

Этап 2 дорожной карты [ROADMAP_NATIVE.md](../docs/ROADMAP_NATIVE.md): выделение
криптопримитивов E2E-шифрования в отдельное Rust-ядро, которое позже будет
использоваться всеми клиентами платформы через биндинги.

## Что внутри

- X25519 + XSalsa20-Poly1305 (NaCl box) через крейт `crypto_box` —
  **бинарно совместимо** с мобильным клиентом (tweetnacl `nacl.box`):
  одинаковая раскладка ciphertext+MAC и одинаковый формат конверта E2E
  (`{ v, alg, epk, nonce, boxes }`, см. `docs/readme_for_AI.md`, раздел
  «E2E-контракт»).
- `generate_keypair()` — ключевая пара устройства (приватный ключ не покидает
  устройство).
- `seal_for_recipients(plaintext, &[recipient_public])` — эфемерная пара +
  nonce + по боксу на каждого получателя.
- `open_sealed(sealed, my_public, my_secret)` — расшифровка своего бокса.
- `x25519_dh(my_secret, their_public)` — raw X25519-DH (RFC 7748): общий
  секрет из identity-ключей (этап 7, вход Double Ratchet; клампинг RFC 7748,
  KAT-вектор §6.1 — в тестах ядра и всех smoke-зеркалах).

## Сборка и тесты

```bash
cd medchat-v2/core
cargo test
cargo build --release
```

Тесты покрывают: roundtrip для нескольких получателей, отказ на чужом ключе,
отказ на повреждённом шифротексте, пустой список получателей.

## Статус и следующие шаги

- **Сейчас**: чистая библиотека без внешних биндингов (etap 2 roadmap).
- **Дальше**: napi-rs-биндинги для Node (горячие пути сервера), UniFFI-биндинги
  для Swift (iOS) и Kotlin (Android), Double Ratchet (forward secrecy),
  при юридической необходимости — сертифицированные ГОСТ СКЗИ (см. LEGAL.md §2).
- **CI**: Rust-ядро пока не собирается в CI (нет Rust-toolchain в workflow);
  добавить job `core-tests` — пункт roadmap по инфраструктуре.

## Совместимость форматов

Мобильный клиент (tweetnacl) и Rust-ядро должны договориться о кодировке
base64 и порядке полей конверта — источник истины: мобильный
`e2eCryptoService.js` и раздел «E2E-контракт» в `docs/readme_for_AI.md`.

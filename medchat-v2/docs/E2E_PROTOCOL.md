# E2E_PROTOCOL: спецификация сквозного шифрования MedChat v2

> Нормативный документ протокола E2E: конверты x25519-box, реестр ключей
> UserKey, Double Ratchet поверх конверта, интеграционный контракт клиентов.
> Закрывает пункт DoD этапа 7 ROADMAP_NATIVE.md («спецификация»). Внешний аудит
> и ГОСТ СКЗИ — операторские позиции (УЗ-1, LEGAL.md). Реализация — medchat-v2/core
> (Rust) + клиенты; контракт-векторы и негативные тесты гоняются в CI на каждый пуш.

## 1. Модель угроз

Гарантии:
- Сервер (и любой, скомпрометировавший его БД/MinIO) не может прочитать содержимое
  E2E-сообщений, файлов и голосовых: в БД только шифротекст (content пуст, конверт
  в metadata.e2e), файлы в MinIO — wire = nonce(24) || ciphertext без имени и MIME.
- Forward secrecy: компрометация текущего состояния Double Ratchet устройства
  не раскрывает прошлые сообщения — message keys одноразовые и стираются при
  выводе (в skip-store ключ изымается при первом использовании). Break-in
  recovery: DH-шаг ratchet восстанавливает безопасность после компрометации,
  как только собеседник отвечает на новом ключе.
- Replay и tamper: повтор номера сообщения отклоняется (OutOfOrder), AEAD-тег
  AES-256-GCM ловит подделку шифротекста (Aead), структура заголовка и длины
  проверяются на границе формата (BadHeader/InvalidArgument).
- DoS-границы skip-store: не более MAX_SKIP=2000 ключей за один шаг и
  MAX_SKIPPED_KEYS=500 одноразовых ключей в хранилище (превышение — OutOfOrder).

Честные ограничения (осознанные, не скрываются):
- Метаданные видимы серверу: участники чата, время, размеры конвертов, открытый
  заголовок ratchet-сообщения (dh_pub, pn, n — как в Signal), факт fallback.
- Identity-ключи проверяются только вручную: safety number (60 цифр, SHA-512)
  участники сверяют лично; автоматического TOFU/прозрачности ключей нет.
- Нет prekeys/асинхронного старта: ratchet-сессия стартует, когда у обеих сторон
  зарегистрированы identity-ключи (X3DH-lite, см. §4.1).
- Нет пост-квантовой стойкости; нет групповых MLS-сессий — ratchet попарный,
  per-remote (устройство с устройством).
- Админы (clinic_admin/system_admin) не являются участниками E2E-переписки и
  содержимое прочитать не могут — свойство end-to-end модели.
- Honest-fallback: при неполном покрытии участников ключами чат честно падает
  в plaintext (доступность важнее) — такие сообщения E2E не претендуют.

## 2. Реестр ключей UserKey и конверты x25519-box

Ключи устройства:
- Каждое устройство генерирует X25519 keypair. Приватный ключ никогда не покидает
  устройство: только системный secure storage (iOS Keychain / Android Keystore /
  Windows Credential Manager / libsecret; RN-клиент: expo-secure-store, fallback
  на AsyncStorage только на платформах без secure storage — LEGAL.md §2).
- API реестра (все под authenticate(), чужие ключи — 403): POST /api/keys
  {keyId, publicKey, deviceName?} — upsert (регистрация/ротация); GET /api/keys —
  свои; DELETE /api/keys/:keyId — деактивация (is_active=false, история
  сохраняется); GET /api/chats/:id/keys — активные ключи всех участников чата.

Конверт (envelope) — единица E2E-транспорта:
- JSON { v:1, alg:"x25519-box", epk:<эфемерный pubkey b64>, nonce:<24 байта b64>,
  boxes:{ [userId]: <шифротекст b64> } } — по боксу на каждого участника плюс
  бокс отправителя (обязателен, сервер проверяет). Поля base64, plaintext бокса —
  UTF-8. NaCl box: X25519 + XSalsa20-Poly1305, байт-в-байт совместим с tweetnacl
  (мобильный клиент) и Rust-ядром (crypto_box/SalsaBox) — сверен каноническим
  вектором NaCl на общей фикстуре в CI.
- Серверная валидация (validateE2EEnvelope): структура, не более 10 boxes, не более
  32 КБ/бокс и 256 КБ конверт, бокс отправителя обязателен, content обязан быть
  пуст. Валидный конверт: metadata.e2e = конверт, content пуст, isEncrypted=true,
  lastMessageText пуст — plaintext в БД отсутствует. Без конверта — легаси
  plaintext-путь (обратная совместимость).
- Файлы и голосовые (гибридное шифрование): payload шифруется на устройстве
  случайным 32-байтным ключом (secretbox); в MinIO уходит только wire =
  nonce(24) || ciphertext; ключ файла едет ВНУТРИ того же конверта: payload
  бокса — JSON { mc:2, t:<имя>, k:<ключ b64>, m:<MIME> } (серверных изменений не
  требуется — валидатор содержимое боксов не трогает); расшифровка при просмотре.
- Safety number (fingerprint чата): 60 десятичных цифр (12 групп по 5) из SHA-512
  по отсортированным тройкам (userId, keyId, publicKey) активных ключей чата;
  вычисляется на устройстве из GET /api/chats/:id/keys, сервер в доверии не
  участвует. Несовпадение у участников = в реестре чужой ключ (MITM/подмена);
  любая ротация меняет код.

## 3. Поверхности ядра (биндинги)

- Rust lib (medchat-core): generate_keypair, seal_for_recipients / open_sealed,
  x25519_dh (raw DH, клампинг RFC 7748), RatchetState (init_initiator /
  init_responder, encrypt / decrypt), RatchetMessage to_wire / from_wire, CoreError.
- napi (Node, src/node.rs, feature napi-bind): generateKeypair, sealForRecipients,
  openSealed, x25519Dh, класс JsRatchetState (initInitiator / initResponder,
  encrypt / decrypt / decryptWire, ratchetMessageToWire / FromWire, save / restore),
  константы ratchetHeaderSize(40) / ratchetNonceSize(12).
- UniFFI (Swift/Kotlin, src/uniffi_iface.rs, feature uniffi-bind): конверты,
  bcrypt_verify, x25519Dh, MedRatchetState (Mutex — uniffi-методы Object
  иммутабельны; init/encrypt/decryptWire/save/restore), ratchetMessageToWire;
  ошибка MedCryptoException (поле detail — обход бага bindgen 0.28.3).
- Desktop: ядро напрямую path-депом (Rust к Rust, без FFI); tauri-команды
  e2e_get_or_create_key / e2e_seal / e2e_open, ratchet_encrypt / ratchet_decrypt,
  ratchet_save / load / delete; secure storage — keyring 3 (сервисы medchat.e2e,
  medchat.ratchet).
- Персистентность состояния: bincode (feature serde). Blob содержит СЕКРЕТЫ
  (приватный ratchet-ключ, цепочки, skip-store) — только secure storage устройства.

## 4. Double Ratchet (поверх конверта)

### 4.1. Согласование сессии — X3DH-lite, без prekeys

- ss = x25519(identity_priv_A, identity_pub_B) — raw X25519-DH identity-ключей
  из реестра UserKey (симметричен; клампинг RFC 7748; KAT-вектор §6.1 RFC 7748
  сверяют Rust-тесты и все smoke-зеркала).
- Роль детерминирована: лексикографически меньший keyId — инициатор. Обе стороны
  сходятся к ролям без рукопожатия.
- Инициатор: init_initiator(ss, публичный identity-ключ собеседника как первый
  ratchet-ключ): свежая ratchet-пара, KDF_RK(ss, DH(fresh, remote)) даёт root и
  исходящую цепочку; отправка возможна сразу.
- Ответчик: init_responder(ss, своя identity-пара как первый ratchet-ключ);
  root = ss; отправка до первого входящего невозможна (NotInitialized —
  honest-fallback на обычный конверт).
- Обмен: plaintext бокса конверта = JSON {"t":"r1","k":<keyId отправителя>,
  "w":<wire b64>}; content пуст. Слой над конвертом: сервер видит только конверт.

### 4.2. KDF (HMAC-SHA256)

- KDF_RK(root, dh_out) = (HMAC-SHA256(root, dh_out || 0x01),
  HMAC-SHA256(root, dh_out || 0x02)) — новый root и цепочка.
- KDF_CK(chain) = (HMAC-SHA256(chain, 0x01), HMAC-SHA256(chain, 0x02)) —
  следующая цепочка и одноразовый message key.
- Message key выводится, используется и стирается; хранится только в skip-store
  (до первого использования).

### 4.3. Формат сообщения

- header (40 байт, открытый): dh_pub(32) || pn(4, LE) || n(4, LE).
- AEAD: AES-256-GCM, message key 32 байта, nonce 12 байт (OsRng).
- wire = header(40) || nonce(12) || ciphertext(plaintext + 16 тег). from_wire
  валидирует минимальную длину (52) и структуру заголовка сразу — битые байты
  отклоняются на границе формата.

### 4.4. Алгоритмы

- encrypt: продвинуть chain_send через KDF_CK; header(dh_self, prev_send_count,
  send_count); n = send_count++.
- decrypt, по порядку: (1) hit в skip-store — ключ изымается, AEAD;
  (2) новый dh_pub — DH-ratchet: сначала skip ключей старой входящей цепочки до pn,
  затем root/chain_recv из KDF_RK, свежая своя ratchet-пара и вторая KDF_RK даёт
  новую исходящую цепочку, счётчики сбрасываются; (3) n > recv_count — skip до n
  в текущей цепочке (лимиты MAX_SKIP / MAX_SKIPPED_KEYS); n < recv_count — replay,
  OutOfOrder; продвинуть chain_recv, AEAD на одноразовом ключе.

### 4.5. Персистентность и UI-контракт клиентов

- Аккаунт сессии: ratchet.<chatId>.<remoteKeyId> в secure storage платформы;
  сессии per-remote (устройство с устройством), ленивая инициализация: отправка
  создаёт сессию инициатора, первый входящий — отвечающего.
- Per-chat тумблер: флаг "1"/"0" в secure storage (не секрет), default off.
- Honest-fallback: любая ошибка ratchet — обычный E2E-конверт, чат не ломается;
  входящие расшифровываются лениво, при неудаче — честная плашка.
- Клиенты: desktop (ratchet_encrypt/ratchet_decrypt), iOS (RatchetService +
  ChatView), Android (RatchetService + MedchatApp). RN (reference-клиент)
  ratchet-сессию НЕ держит: входящий payload {"t":"r1",...} рисуется честным
  бейджем (isRatchetPayload).

## 5. Негативные тесты и верификация (DoD)

- Ядро (core/src/ratchet.rs, CI core-tests): forward_secrecy_old_message_keys_gone
  (повтор старого n после продвижения цепочки — OutOfOrder: ключи уничтожены),
  out_of_order_decoded_via_skip_store (+ replay после изъятия ключа),
  too_many_skipped_rejected (анти-DoS), tampered_ciphertext_rejected (AEAD),
  bad_header_rejected, wire_too_short_rejected,
  wire_tampered_ciphertext_rejected_by_aead, responder_cannot_send_before_first_receive,
  сериализация: диалог продолжается после restore, skip-store переживает
  сериализацию, serialized_blob_contains_secrets (честная пометка: blob —
  только secure storage).
- Fuzz (CI fuzz-smoke; суточный DoD-прогон — по требованию): open_sealed_fuzz
  (враждебный конверт), ratchet_wire_fuzz (мусорный wire + decrypt),
  ratchet_roundtrip_fuzz (произвольный plaintext байт-в-байт).
- Контракт-векторы (общие фикстуры, байт-в-байт между реализациями): NaCl box
  (nacl_box_vector.hex: Rust + tweetnacl в server-tests), AES-256-GCM KAT BoringSSL
  (aes_gcm_vector.hex: Rust + Node crypto), bcrypt KAT (bcrypt_vector.txt),
  X25519 KAT RFC 7748 §6.1 (Rust + все smoke-зеркала).
- Smoke-зеркала биндингов (runtime в CI): napi-smoke.js (настоящий Node-процесс),
  MedchatCoreSmoke.swift (ios-smoke), MedchatCoreSmoke.kt (android-smoke): конверт
  roundtrip, бокс отправителя, битые длины, ratchet in-order / wire / skip-store /
  replay, save/restore, bcrypt KAT.
- Сервер: юнит-тесты валидатора (tests/e2eEnvelope.test.js), smoke-секция E2E [12]
  (ротация ключей, 403 на чужие ключи, plaintext-защита).

## 6. Остаток (операторские позиции)

Внешний аудит (УЗ-1), ГОСТ СКЗИ (если аттестация ФСТЭК), TLS-пиннинг (вместе с
прод-сертификатом), суточный fuzz-прогон по требованию. См. ROADMAP_NATIVE.md §3–4,
LEGAL.md, DESKTOP_RELEASE.md (паттерн честности CI/оператор).

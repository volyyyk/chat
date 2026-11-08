# readme_for_AI — полная карта MedChat v2 для ИИ-агентов

> Этот документ написан для ИИ-ассистентов, которые будут продолжать работу над проектом.
> Здесь: структура, контракты, бизнес-логика, а главное — честный разбор,
> что реализовано «по-настоящему», а где временные заплатки и осознанные компромиссы.
> Обновлён после security-аудита (коммит 1fafeb9), серии фиксов
65ec99c → 5a8eceb (user-API, печатная форма рецептов, чистка мёртвого шифрования мобилки),
серии E2E-коммитов d11762c → 596c4a3 (сквозное шифрование содержимого сообщений —
см. раздел 5, «E2E-контракт»), каркаса Rust-ядра medchat-core с джобой core-tests
в CI (3a70911 → ee76670), перевода приватных ключей в Keychain/Keystore (3ab5cf6)
и покрытия E2E тестами (02dc969 → 7cb0832: юнит-тесты валидатора конвертов +
smoke-секция E2E [12]) и наведение честности данных (815f6cb → a508fda:
маркер E2E-сообщения в smoke — metadata.e2e; честный дефолт
Message.isEncrypted=false — легаси true ложно помечал plaintext), skip-store
в Double Ratchet (6aff983 → d033eeb: расшифровка внеочередных сообщений) и фикс
критической синтаксической ошибки в Message.js, внесённой a508fda (ad575d3 —
из-за неё сервер не запускался вовсе). E2E распространено на файлы и
голосовые (42e5a1d → ed9a661: гибридное шифрование payload, ключ файла внутри
конверта, расшифровка при просмотре) и wire-формат RatchetMessage для
биндингов (a43102d). Кросс-платформенные контракт-векторы Этапа 2 (1ce9516):
канонический вектор NaCl box проверяется в Rust-ядре и tweetnacl на общей
фикстуре (см. §8, §10). Верификация fingerprint-кодов E2E (safety number)
реализована в мобильном клиенте (347bc9d + ec1a0de). napi-rs-биндинги
ядра для Node.js (754f677: конвертные примитивы; 2bb38f2: класс JsRatchetState
для Double Ratchet). Контракт-векторы AES-256-GCM (e7879a7: KAT-векторы
BoringSSL на общей фикстуре — Rust и Node crypto байт-в-байт) и стабилизация
napi-сборки в CI (30c3f5e MSRV 1.77 → a1061cd тесты Buffer без Debug →
e411a54 feature napi-bind; e411a54 — зелёный во всех трёх джобах).
Контракт-векторы bcrypt (8776f7c): KAT-векторы OpenBSD/crypt_blowfish на общей
фикстуре — Rust-ядро (bcrypt_verify) и серверный нативный bcrypt (compareSync,
cost 12 в authService) верифицируют одинаково.
Бенчмарки крипто-пути (d2db23e: criterion benches/crypto.rs; f79de00:
Node-зеркало server/bench/coreBench.js + джоба CI core-bench с публикацией
лога ci-logs/ci-bench.log для сверки DoD «≥ x10»).
Fuzz-цели cargo-fuzz (враждебный конверт open_sealed, мусорный wire RatchetMessage +
decrypt, roundtrip произвольного plaintext; джоба CI fuzz-smoke — smoke-итерации,
суточный DoD-прогон отдельно).
UniFFI-биндинги Swift/Kotlin (feature uniffi-bind: обёртки конвертов + bcrypt
+ MedRatchetState для Double Ratchet; генерация обвязки — джоба CI
uniffi-bindings).

---

## 1. Что это за проект

MedChat v2 — телемедицинская платформа «клиника — врачи — пациенты»:

- **Чаты** пациент ↔ врач: текст, голосовые (expo-av, m4a), файлы; Socket.IO real-time.
- **E2E-шифрование содержимого сообщений, файлов и голосовых** (X25519 + NaCl box;
  файлы — гибридно: payload шифруется случайным ключом secretbox, ключ файла едет
  в том же конверте; шифрование на устройстве, сервер хранит только шифротекст —
  раздел 5).
- **Платные сообщения**: первое сообщение в чате бесплатно; 30 дней после completed-приёма
  бесплатно; далее 50 ₽ за сообщение. Оплата с **тестового баланса** — реальных платёжных
  шлюзов НЕТ, и это осознанное требование владельца (см. п. 8).
- **Делёж дохода**: врачу 80 %, клинике 20 % (`clinic.doctorSharePercent`, override на клинике).
- **Записи на приём** (подтверждение врачом, отмена, статусы), **электронные рецепты**
  (создаёт врач, «подписывает» POST /:id/sign), **файлы** (MinIO, MIME-лист).
- **Роли**: `system_admin`, `clinic_admin`, `doctor`, `patient`.

## 2. Стек

| Часть | Технологии |
|---|---|
| server | Node 18+, Express, Sequelize + PostgreSQL, Redis (rate-limit), Socket.IO, MinIO, Joi, Jest + supertest |
| mobile | React Native / Expo 48 (все роли, основной сценарий — пациент), tweetnacl (X25519 + box для E2E), expo-secure-store (Keychain/Keystore) |
| web | React (порт 3002, клиника/админ) |
| core | Rust-ядро medchat-core (этап 2 ROADMAP_NATIVE): X25519 + NaCl box (SalsaBox, crypto_box 0.9), совместимо с мобильным клиентом; Double Ratchet (этап 7, прототип + skip-store): x25519-dalek 2 + HMAC-SHA256 + AES-256-GCM; napi-rs-биндинги для Node (754f677 → 2bb38f2, feature napi-bind e411a54); bcrypt_verify — проверка паролей против серверных bcrypt-хэшей, паритет с authService cost 12 (крейт bcrypt 0.15, 8776f7c); бенчмарки criterion (d2db23e, benches/crypto.rs); uniffi-биндинги Swift/Kotlin (feature uniffi-bind) |
| infra | docker-compose (postgres, redis, minio), GitHub Actions |

## 3. Структура проекта

```
medchat-v2/
├── server/src/
│   ├── config/        — database.js, redis.js, minio.js
│   ├── controllers/   — 17: auth, user, chat, message, file, payment, transaction,
│   │                    appointment, eprescription, clinic, doctor, patient,
│   │                    notification, backup, webhook, admin, specialty, keys
│   ├── middleware/    — auth (JWT+RBAC, БЕЗ privateKey), validation (Joi),
│   │                    upload (multer, uploadMiddleware(field)), errorHandler (AppError),
│   │                    rateLimit, sanitize, audit
│   ├── models/        — 35 моделей Sequelize (User, Doctor, Patient, Clinic, Chat,
│   │                    Message (+композитный индекс chat_id,created_at), File,
│   │                    Transaction, Balance, BalanceReserve, Appointment, EPrescription,
│   │                    ChatParticipant, RefreshToken, UserKey (реестр публичных
│   │                    ключей E2E), ...)
│   ├── routes/        — 18 файлов (auth, chats, messages, files, payments,
│   │                    transactions, appointments, eprescriptions, users, clinics,
│   │                    keys, ...)
│   ├── seeds/         — testData.js (npm run seed:test): аккаунты, балансы, приёмы
│   ├── services/      — authService, paymentService, balanceService, cryptoService,
│   │                    notificationService, backupService
│   ├── utils/         — logger (winston), chatAccess (canAccessChat),
│   │                    e2eEnvelope (validateE2EEnvelope + лимиты конверта)
│   ├── validators/    — 16 Joi-схем (auth, chat, message, file, payment, transaction,
│   │                    user (updateUserSchema/changePasswordSchema/updateProfileSchema/
│   │                    updatePreferencesSchema/searchUsersSchema + legacy),
│   │                    key (registerKeySchema), ...)
│   └── index.js       — Express bootstrap + Socket.IO (joinChat/typing/newMessage);
│                        fail-fast при JWT_SECRET < 8 символов
├── server/bench/       — coreBench.js: Node-бенчмарки крипто-пути
│   │                    (tweetnacl box, AES-256-GCM, bcrypt; зеркало
│   │                    benches/crypto.rs ядра, f79de00)
├── server/tests/
│   ├── cryptoService.test.js, errorHandler.test.js, paymentService.test.js,
│   │                    e2eEnvelope.test.js (валидация E2E-конвертов, 02dc969),
│   │                    coreInterop.test.js (контрактный вектор NaCl box на
│   │                    общей фикстуре core/tests, 1ce9516), coreAesGcm.test.js
│   │                    (контрактные векторы AES-256-GCM на фикстуре core/tests, e7879a7),
│   │                    bcryptInterop.test.js (контрактные векторы bcrypt на
│   │                    фикстуре core/tests, 8776f7c)
│   ├── integration/auth.test.js
│   └── security/      — jwtSecurity, registerSecurity, paymentsSecurity, transactionsIdor
├── mobile/src/
│   ├── config/config.js        — API_URL http://localhost:3000 (БЕЗ /api/v1)
│   ├── context/ (3)            — AuthContext (pass-through), ThemeContext,
│ │                            NotificationContext (ChatContext УДАЛЁН, см. п. 8.5)
│   ├── hooks/ (4)              — useChat (server-first чат + интеграция E2E), useAuth, ...
│   ├── screens/ (19)           — Login, Register, ChatList, Chat, Payment,
│ │                            Appointments, EPrescriptions, Profile, ...
│   ├── services/ (9)           — authService, chatService (socket+REST), api, file,
│ │                            payment, database (экспортирует database + initDatabase),
│ │                            notification, backup, e2eCryptoService (X25519 E2E:
│ │                            base64/UTF-8 pure JS, keypair в expo-secure-store
│ │                            (Keychain/Keystore) с fallback и миграцией, конверты,
│ │                            гибридное шифрование файлов/голосовых,
│ │                            расшифровка при просмотре)
│   ├── components/ (8)         — MessageBubble (🔒 на E2E-сообщениях), AudioPlayer, ...
│   ├── navigation/, styles/, utils/
├── web/src/             — pages (7), services, context
├── core/                — Rust-ядро medchat-core (Cargo.toml, src/lib.rs, src/ratchet.rs):
│                          SalsaBox (X25519 + XSalsa20-Poly1305, crypto_box 0.9),
│                          generate_keypair / seal_for_recipients / open_sealed,
│                          CoreError; ratchet.rs — Double Ratchet (KDF_RK/KDF_CK
│                          HMAC-SHA256, AES-256-GCM на message keys, 6aff983;
│                          skip-store внеочередных
│                          сообщений, d033eeb; wire-формат RatchetMessage
│                          (a43102d) — 13 тестов);
│                          tests/interop_vectors.rs — контрактный вектор NaCl
│                          box на фикстуре nacl_box_vector.hex (1ce9516);
│                          tests/aes_gcm_vector.rs + aes_gcm_vector.hex —
│                          KAT-векторы AES-256-GCM из BoringSSL (e7879a7);
│                          tests/bcrypt_vector.rs + bcrypt_vector.txt —
│                          KAT-векторы bcrypt из OpenBSD/crypt_blowfish (8776f7c);
│                          node.rs — napi-rs-биндинги для Node (754f677 →
│                          2bb38f2: конвертные примитивы + JsRatchetState; feature
│                          napi-bind, e411a54); CI: cargo check --tests +
│                          cargo test --no-default-features (джоба core-tests;
│                          бенчмарки — джоба core-bench);
│                          benches/crypto.rs — criterion-бенчмарки
│                          крипто-пути (d2db23e: конверты x25519-box,
│                          Double Ratchet, bcrypt cost 5/12);
│                          napi-smoke.js — Node-интеграция napi-обёрток
│                          (джоба napi-build: сборка .node + JS-тесты);
│                          fuzz/ — fuzz-цели cargo-fuzz (враждебный конверт,
│                          мусорный wire + decrypt, roundtrip произвольного
│                          plaintext; джоба CI fuzz-smoke);
│                          uniffi_iface.rs — UniFFI-биндинги Swift/Kotlin
│                          (feature uniffi-bind, джоба CI uniffi-bindings)
├── launcher/            — launch.js, stop.js, README.md — «запуск по кнопке», ПАПКА УДАЛЯЕМАЯ
├── docs/                — API, ARCHITECTURE, DEPLOYMENT, GETTING_STARTED, LEGAL, OFFER,
│                          PRIVACY_POLICY, SECURITY_AUDIT, ROADMAP_NATIVE + этот файл
├── docker/, docker-compose.yml
└── .github/workflows/ci.yml — server-tests + e2e-smoke + core-tests
```

## 4. Тестовые данные (`cd server && npm run seed:test`)

| Аккаунт | Роль | Пароль | Баланс |
|---|---|---|---|
| admin@medchat.test | clinic_admin | Test1234! | 0 |
| doctor@medchat.test | doctor | Test1234! | 0 |
| patient1@medchat.test | patient | Test1234! | 200 ₽ |
| patient2@medchat.test | patient | Test1234! | 1000 ₽ |

Приёмы: completed −5 дней и −40 дней от текущей даты (проверка окна бесплатных сообщений).
Smoke-тест: `npm run test:smoke` — поднимает сервер на :3990 и гоняет сценарий всех ролей.

## 5. Контракт API (ключевое)

Формат ошибок везде: `{ error: 'CODE', message: '...' }` (AppError из errorHandler).

### Auth
- `POST /api/auth/register` `{email, password, role∈patient|doctor, firstName, lastName, clinicCode?}`
  → 201 `{user, accessToken, refreshToken, expiresIn}`.
  **clinic_admin/система не принимает** (security-фикс 1fafeb9).
- `POST /api/auth/login` → `{user (+patientProfile/doctorProfile), accessToken, refreshToken, expiresIn}`
- `GET /api/auth/me`, `POST /api/auth/refresh {refreshToken}`, `POST /api/auth/change-password`
- JWT: **HS256 с пиннингом алгоритма** в middleware/auth.js; access ~15m;
  refresh — randomBytes(64), хранится в БД, ротация + revoke (смена пароля/блокировка).

### Users (оживлён в 65ec99c — раньше был мёртв)
- `GET /api/users/me`, `PUT /api/users/me` (при смене email/username требует
  `currentPassword`), `PUT /api/users/me/password`, `PUT /api/users/me/profile`,
  `GET|PUT /api/users/me/preferences`, `POST /api/users/me/avatar` (multipart, multer),
  `DELETE /api/users/me/avatar`
- Админ (`system_admin|clinic_admin`): `GET /api/users`, `GET /api/users/statistics`
  (роут ДО `:id`!), `GET|PUT|DELETE /api/users/:id`, `PUT /:id/status` (enum
  active/inactive/pending/banned/deleted), `PUT /:id/role` (enum
  system_admin/clinic_admin/doctor/patient)
- Профильные инклуды — только через алиасы: `doctorProfile`, `patientProfile`, `clinic`,
  `specialtyDetails` (Doctor.belongsToMany(Specialty) через DoctorSpecialty).

### Чаты и сообщения
- `GET /api/chats`, `POST /api/chats`, `GET /api/chats/:id/messages?page&limit` (default 50,
  ответ `{data: [хронология], pagination}`)
- `POST /api/chats/:id/messages` `{content, type, attachments?, paymentTransactionId?, envelope?}`
  - с `paymentTransactionId`: проверка Transaction (status=completed, type=message_payment,
    **одноразовость** — повтор → 409);
  - с `envelope`: E2E-путь (см. «E2E-контракт» ниже) — content обязан быть пуст;
  - без: `PaymentService.resolveMessageFree`; если не free — **авто-списание** с тестового
    баланса (50 ₽), при нехватке средств → 402 PAYMENT_REQUIRED.
- ENUM типов сообщений: `text, image, video, audio, file, system, payment, prescription,
  appointment, reminder`; attachments — массив UUID файлов (привязка через File.update).
- `GET /api/eprescriptions/:id/printable` — печатная форма HTML; специальности врача
  приходят из `doctor.specialtyDetails` (include через алиас, 65ec99c).

### E2E-контракт (сквозное шифрование сообщений и файлов, d11762c → ed9a661)
**Модель доверия**: сервер — реестр публичных ключей и транспорт; plaintext содержимого
E2E-сообщений серверу недоступен (хранится только шифротекст). Метаданные (участники,
время, размеры конвертов) сервер видит.

- **Ключи**: каждое устройство генерирует X25519 keypair (tweetnacl). **Приватный ключ
  никогда не покидает устройство**: хранится в аппаратно-защищённом хранилище
  (expo-secure-store: iOS Keychain / Android Keystore,
  keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY) с прозрачной миграцией из
  AsyncStorage и fallback на AsyncStorage только на платформах без secure storage
  (например, expo web) — см. LEGAL.md §2. Публичный ключ регистрируется на сервере.
- **Модель UserKey** (user_keys): userId, keyId, publicKey (base64), deviceName, is_active;
  unique(user_id, key_id); models/index.js подхватывает автоматически (readdirSync).
- **API ключей** (routes/keys.js, Joi registerKeySchema, все под authenticate()):
  - `POST /api/keys` `{keyId, publicKey, deviceName?}` — upsert (регистрация/ротация);
  - `GET /api/keys` — свои ключи;
  - `DELETE /api/keys/:keyId` — деактивация (is_active=false, не удаление — история);
  - `GET /api/chats/:id/keys` — активные ключи ВСЕХ участников чата (доступ через
    canAccessChat; в ответе userId + keyId + publicKey).
- **Конверт** (envelope): `{ v:1, alg:'x25519-box', epk: <эфемерный pubkey b64>,
  nonce: <24 байта b64>, boxes: { [userId]: <шифротекст b64> } }` — по боксу на каждого
  участника + бокс отправителя (чтобы свои другие устройства могли прочитать).
- **Серверная валидация** (validateE2EEnvelope, utils/e2eEnvelope.js — вынесена из
  chatController в 02dc969, покрыта юнит-тестами tests/e2eEnvelope.test.js): структура конверта,
  ≤10 boxes, ≤32 КБ/бокс, ≤256 КБ конверт, бокс отправителя обязателен, content обязан
  быть пуст. При валидном конверте: `Message.metadata.e2e = конверт`, `content=''`,
  `isEncrypted=true`, `lastMessageText=''` — **plaintext в БД отсутствует**.
  С a508fda дефолт модели Message.isEncrypted=false (легаси true был написан до E2E
  и ложно помечал plaintext-сообщения, включая сид и prescription); true ставится
  только контроллером при валидном конверте.
- **Без envelope** — старый plaintext-путь (обратная совместимость; smoke-тесты не ломаются).
- **Мобильный клиент** (services/e2eCryptoService.js + hooks/useChat.js):
  - при монтировании useChat регистрирует свой публичный ключ (идемпотентно, best-effort);
  - отправка: участник-проверки (мой id в ChatParticipant, у ВСЕХ участников есть ключи,
    включая мой) → encryptForRecipients; иначе graceful fallback на plaintext —
    **чат никогда не ломается**;
  - входящие: расшифровка конвертов в REST-истории и Socket.IO newMessage;
    нерасшифровываемое → «🔒 Зашифрованное сообщение»;
  - чат-лист: пустой preview + наличие lastMessageId = зашифрованное сообщение (🔒);
  - MessageBubble рисует 🔒 на каждом сообщении с metadata.e2e.
- **Файлы и голосовые внутри E2E (гибридное шифрование, 42e5a1d → ed9a661)**:
  payload шифруется на устройстве случайным 32-байтным ключом (nacl.secretbox);
  на сервер/MinIO уходит только wire = nonce(24) || ciphertext (файл payload.bin,
  application/octet-stream — исходные имя и MIME-тип серверу неизвестны).
  Ключ файла едет ВНУТРИ того же конверта x25519-box: payload бокса — JSON
  { mc: 2, t: <имя>, k: <ключ b64>, m: <MIME> } вместо текста (одно
  envelope-правило сохранено, серверных изменений НЕ требуется —
  validateE2EEnvelope не трогает содержимое боксов). Просмотр:
  e2eCryptoService.fetchAndDecryptFile скачивает wire с Bearer-заголовком
  (эндпоинт /api/files/:id/download аутентифицированный!), расшифровывает
  на устройстве и кладёт plaintext в кэш (file:// URI, кэш на сообщение);
  голосовые воспроизводятся из локального расшифрованного URI, документы
  открываются через expo-sharing; legacy-файлы (без ключа) качаются
  downloadAsync с Authorization. Fallback тот же, что у текста: нет ключей
  у участника → plaintext-загрузка (доступность важнее).
- **Fingerprint чата / safety number (347bc9d + ec1a0de, этап 7)**:
  e2eCryptoService.chatFingerprint(keys) — 60 десятичных цифр (12 групп по 5)
  из SHA-512 (nacl.hash) по отсортированным тройкам (userId, keyId, publicKey)
  активных ключей чата; вычисляется на каждом устройстве из уже имеющихся
  данных (GET /api/chats/:id/keys), сервер не участвует в доверии. Иконка
  verified-user в шапке ChatScreen показывает код: участники сверяют его
  лично или по телефону — несовпадение = в реестре чужой ключ (подмена/MITM).
  Любая ротация/новое устройство/деактивация меняет код; не-E2E чаты
  (plaintext-fallback) кода не имеют. Best-effort: сбой загрузки ключей
  не блокирует чат.
- **Rust-ядро** (medchat-v2/core, крейт medchat-core): те же примитивы на crypto_box 0.9
  (SalsaBox = X25519 + XSalsa20-Poly1305) — generate_keypair / seal_for_recipients /
  open_sealed, CoreError; бинарно совместимая раскладка боксов с tweetnacl —
  подтверждена контракт-тестом на каноническом векторе NaCl box (1ce9516:
  core/tests/interop_vectors.rs + server/tests/coreInterop.test.js, общая
  фикстура nacl_box_vector.hex, обе стороны в CI). Этап 2 ROADMAP_NATIVE.
  **napi-rs-биндинги для Node** (754f677 → 2bb38f2, src/node.rs):
  generateKeypair/sealForRecipients/openSealed/keySize/nonceSize + класс
  JsRatchetState (фабрики initInitiator/initResponder, encrypt/decrypt/
  decryptWire, ratchetMessageToWire/FromWire, ratchetHeaderSize(40),
  ratchetNonceSize(12)). CoreError → napi::Error, битые длины → InvalidArg.
  Состояние ratchet наружу НЕ сериализуется — персистентность на вызывающей
  стороне (secure storage). .node-артефакт собирает джоба CI napi-build (cargo build --release →
  rename cdylib → medchat-core.linux-x64-gnu.node, upload-artifact;
  прод-упаковка с метаданными платформ — napi-cli); в core-tests биндинги
  проверяются компиляцией (cargo check --tests), тесты логики ядра —
  cargo test --no-default-features (feature napi-bind, e411a54: тестовый
  бинарник не может линковать napi_*-символы — их даёт только процесс Node,
  napi-rs issue #1099; юнит-тесты самих обёрток выполняются джобой napi-build
  в настоящем Node: napi-smoke.js — JS-зеркало тех же проверок).
  UniFFI-биндинги для Swift/Kotlin реализованы (feature uniffi-bind: src/uniffi_iface.rs — обёртки конвертов, bcrypt_verify, MedRatchetState на Mutex (uniffi-методы иммутабельны), to_wire/from_wire; генерация обвязки — uniffi-bindgen 0.28.3 из git-тега v0.28.3 (library mode; uniffi-крейты отсутствуют в sparse-индексе crates.io, см. §8) в джобе CI uniffi-bindings; персистентность состояния — на вызывающей стороне, Keychain/Keystore).
- **Double Ratchet** (этап 7, прототип): medchat-core/src/ratchet.rs — KDF_RK/KDF_CK на
  HMAC-SHA256 (x25519-dalek 2.0.1 для raw DH, явная feature static_secrets), каждое
  сообщение AES-256-GCM на одноразовом message key, DH-шаг при смене ratchet-ключа
  собеседника; forward secrecy + break-in recovery. Skip-store реализован (d033eeb): одноразовые
  message keys пропущенных номеров буферизуются (MAX_SKIP=2000, MAX_SKIPPED_KEYS=500,
  превышение → OutOfOrder), replay по-прежнему отклоняется — сообщения доставляются
  и расшифровываются вне порядка. В клиенты НЕ интегрирован (мобильный клиент работает
  на конвертах x25519-box) — интеграция после биндингов.
- **Админы** (clinic_admin/system_admin) **не являются участниками E2E-переписки** и
  прочитать содержимое E2E-сообщений не могут — осознанное свойство end-to-end модели.
- **Остаточные ограничения** (честно): файлы/голосовые шифруются только при
  полном покрытии ключами (нет ключа у участника → plaintext-fallback,
  LEGAL.md §2); метаданные (в т.ч. размер wire-файла) видимы серверу;
  Double Ratchet (forward secrecy) пока НЕ интегрирован в клиенты — прототип
  с skip-store и wire-форматом RatchetMessage готов в medchat-core (этап 7
  ROADMAP_NATIVE.md); AsyncStorage остаётся fallback-хранилищем приватного
  ключа только на платформах без secure storage (expo web).

### Файлы, приёмы, рецепты
- `POST /api/files/upload` — multipart поле `file`, `chatId` optional (Joi uuid)
- `GET /api/appointments/my?limit=100`; `POST /api/appointments/:id/confirm` (врач);
  отмена из статусов pending/scheduled/confirmed
- `GET /api/eprescriptions?limit=50`; `POST /api/eprescriptions {patientId,...}`;
  `POST /api/eprescriptions/:id/sign` (после подписи status=active)

### Платежи
- `POST /api/payments/process` `{type: message|file|package|deposit, chatId?, fileId?, amount?}`
  — **amount для message/file ПОЛНОСТЬЮ игнорируется сервером** (цены серверные:
  MESSAGE_PRICE_RUB=50, FILE_PRICE_RUB=100, подписки 500/5000; security-фикс 1fafeb9).
  Для deposit/package клиентская сумма допустима в рамках 1..100000 — это пополнение
  СВОЕГО тестового баланса.
- `POST /api/transactions/refund {transactionId}` — только своя транзакция или system_admin (403 иначе)
- `POST /api/transactions/balance/deposit|withdraw` — тестовый баланс (Joi 1..100000)

## 6. Socket.IO контракт (server/src/index.js)

- Клиент: `emit('joinChat', chatRef, cb)` → `cb({ok})` или `cb({error:'forbidden'})`;
  сервер сам джойнит комнаты `chat:<id>` / `chat:uuid:<id>` **с проверкой canAccessChat**.
- `typing {chatId, isTyping}` → broadcast `userTyping {userId, isTyping, chatId}` (только
  если сокет в комнате).
- Сервер эмитит: `newMessage` (полный JSON сообщения с sender/receiver/files includes;
  для E2E-сообщений — с конвертом в metadata.e2e, клиент расшифровывает локально),
  `chatUpdated`, `messageRead`.
- Мобильный `useChat.js` — **server-first**: сокет + REST-fallback, дедупликация newMessage,
  re-join на реконнект ('connect'), оптимистичная отправка (tmp-* id, замена по ответу,
  402 → человекочитаемая ошибка); E2E: расшифровка входящих, восстановление локального
  текста своих сообщений.
- Обработчика `sendMessage` на сервере НЕТ: отправка — только REST POST
  `/api/chats/:id/messages`, сокет — только чтение (newMessage/typing/messageRead).

## 7. Платёжная логика (services/paymentService.js + balanceService.js)

- Цены: `MESSAGE_PRICE()` = env MESSAGE_PRICE_RUB || 50; `FILE_PRICE()` = env FILE_PRICE_RUB || 100;
  `SUBSCRIPTION_PRICES = {monthly: 500, yearly: 5000}`.
- Бесплатно если: отправляет врач чата (`doctor_initiated`); первое сообщение в чате
  (`first_message`); completed-приём за последние FREE_MESSAGE_DAYS(30) (`within_30_days`);
  fallback — `patient.lastAppointmentDate` в окне.
- Списание: `BalanceService.charge` внутри **SQL-транзакции с SELECT ... FOR UPDATE**
  (getOrCreateBalance) → гонки двойного списания исключены, отрицательный баланс невозможен.
- Сплит: `doctorShare = round(price * (clinic.doctorSharePercent||80) / 100)`, клинике остаток.
  Начисление долей — ОТДЕЛЬНО от транзакции списания (non-fatal: доход не должен блокировать
  обмен сообщениями; при сбое начисления — console.error).
- Refund: ownership-проверка в transactionController; создаётся type='refund' + deposit обратно.

## 8. Честно о качестве: заплатки, хитрости, компромиссы

### Сделано честно (можно опираться)
- Все списания/пополнения баланса — SQL-транзакции с row locks; протухание refresh-токенов;
  bcrypt cost 12; Joi-валидация (stripUnknown) на всех роутах; ownership-проверки;
  серверный прайс; тесты мокают только БД-слой (роуты→валидация→сервисы работают по-настоящему).

### Заплатки (временные и перманентные) — ЗНАЙ О НИХ
1. **fileController**: `const file = req.file || (req.files && req.files[0])` — routes/files.js
   использует multer `upload.single('file')` (→ `req.file`), но код исторически читал
   `req.files`, из-за чего КАЖДАЯ загрузка падала 400 «No file provided». Оставлен fallback
   на оба варианта — не ломается ни с single, ни с array.
2. **checksum**: multer diskStorage даёт пустой `file.buffer` → checksum считается через
   `fs.readFileSync(file.path)` в try/catch (ошибка чексуммы не блокирует загрузку).
3. **cleanupExpired** (upload.js): использовал необъявленный `logger` → заменён на
   console.error; сам cleanup обёрнут в try/catch.
4. **Вебхуки** (webhookController.js) — ЗАГЛУШКИ: только console.log, статусы транзакций
   НЕ меняют, проверка подписи закомментирована. Реальные шлюзы отключены по требованию
   владельца (`getPaymentMethods`: yoomoney/tinkoff/card → `isAvailable: false`).
5. **E2E-шифрование**: старый «мобильный encryptionService» был мёртвым сломанным кодом
   (decryptMessage читал переменную до инициализации) — удалён целиком (5a8eceb +
   b7962cd + d11d285) вместе с ChatContext. **Вместо воскрешения старого кода E2E
   спроектировано заново** (d11762c → 596c4a3): X25519 key exchange + серверный реестр
   публичных ключей (UserKey) + конверты x25519-box (раздел 5, «E2E-контракт»).
   Приватные ключи не покидают устройство; plaintext E2E-сообщений в БД отсутствует.
   Честные остаточные ограничения: plaintext-fallback при отсутствии ключей у участника,
   метаданные видимы серверу, файлы вне E2E-контура только в fallback-режиме (с 42e5a1d → ed9a661
   шифруются гибридно, см. LEGAL.md §2). Приватные ключи
   переведены из AsyncStorage в Keychain/Keystore (expo-secure-store, 3ab5cf6) с
   прозрачной миграцией; AsyncStorage — только fallback на платформах без secure storage.
6. **AuthContext (mobile)** — тонкий pass-through на authService + стабы
   verifyClinicCode/checkDoctorVerification (UI ждёт эти методы, реальной серверной
   проверки кода клиники в мобильном флоу нет — она есть на сервере при register doctor).
7. **Лаунчер** НЕ поднимает контейнер server из docker-compose — сервер ставится и
   запускается npm'ом напрямую; докер используется только для postgres/redis/minio.
8. ~~authenticate кладёт `privateKey` в `req.user`~~ — **ИСПРАВЛЕНО в 65ec99c**:
   privateKey больше не прикрепляется к req.user.
9. **userController.checkEmail/checkUsername** — публичное раскрытие существования аккаунта
   (enumeration вектор). Нужен для UX регистрации, прикрыт rate-limit'ом; для прода —
   подумать (capcha/отключение).
10. ~~JWT_SECRET не валидируется при старте~~ — **ИСПРАВЛЕНО в 65ec99c**: index.js делает
    fail-fast (process.exit(1)) при отсутствии/длине секрета < 8 символов.
11. ~~updateMe позволяет менять email/username без повторной верификации~~ —
    **ИСПРАВЛЕНО в 65ec99c**: смена email/username требует `currentPassword`
    (Joi-схема + проверка в контроллере).
12. **Payout** — в тестовом режиме сразу status=completed (реальных выводов нет по требованию).
13. **Лаунчер-README** обещает «npm install при первом запуске» — ставит и server, и web,
    и mobile (expo) по необходимости; Expo-интерактив может требовать выбора аккаунта.
14. **user-API был ЦЕЛИКОМ мёртв до 65ec99c**: routes/users.js импортировал 5 Joi-схем,
    которых не существовало в validators/user.js → validate(undefined) → TypeError → 500
    на PUT /me, /me/password, /me/profile, /me/preferences и GET /api/users. Схемы
    написаны; legacy-экспорты validators/user.js сохранены. Помни: middleware/validation.js
    при schema === undefined роняет запрос — если добавляешь новую схему, проверь имя.
15. **Роуты users**: `GET /api/users/statistics` ДОЛЖЕН идти до `:id` (иначе id="statistics"
    перехватит запрос); avatar-роут обязан оборачиваться в `uploadMiddleware('avatar')`.
    Проверено и зафиксировано в 65ec99c.
16. **Мобильная локальная БД чинилась в d11d285**: database.js не экспортировал ни `database`
    (его импортировали 6 файлов!), ни `initDatabase` (его импортировал App.js). Теперь оба
    экспорта есть. Помни при добавлении новых сервисов: проверяй ИМЯ экспорта против импортов.
17. **Fake loading в App.js удалён** (d11d285): искусственная задержка 2 с «simulate loading»
    замедляла каждый старт без пользы.
18. **E2E добавлен БЕЗ Joi-схемы на POST /api/chats/:id/messages** (тело исторически без
    Joi) — конверт валидируется через чистую функцию validateE2EEnvelope (utils/e2eEnvelope.js,
    вынесена из контроллера в 02dc969, покрыта тестами): структура,
    лимиты размеров, обязательность бокса отправителя, пустой content. Если появится
    Joi-схема на этот роут — не потерять поле envelope.
19. **Rust-ядро в CI**: первая версия lib.rs писалась по устаревшим примерам (seal/open,
    crypto_box::generate_nonce) — два красных прогона (#50, #51) починены по логам
    ci-logs/ci-rust.log (f24ab36, ee76670): реальный API crypto_box 0.9 = encrypt/decrypt,
    SalsaBox::generate_nonce (AeadCore), SecretKey::to_bytes. Урок: перед использованием
    незнакомого Rust-крейта сверяйся с docs.rs его версии, а не с памятью.

### История критических багфиксов (эта серия коммитов, ноябрь 2026)
**Сервер** (ранние фиксы): req.file vs req.files (все загрузки падали 400); file.buffer пуст при
diskStorage; нет audio/m4a|mp4|aac|webm в MIME-листе (голосовые expo-av не грузились); AuditLog с
несуществующими полями; cleanupExpired без logger; Attachments не привязывались к сообщению.
**Сервер** (2bb0a01, e2e-smoke): appointmentController getById — спред DOCTOR_INCLUDE затирал
user-include; eprescriptionController — bare-инклуды Patient×13/Appointment×9 вместо алиасов;
messageController getUnreadCount — Op.notContains на ARRAY(UUID) генерил невалидный `NOT @>`;
smoke-test теперь печатает stdout-хвост сервера при failures.
**Сервер** (65ec99c): весь user-API мёртв из-за несуществующих Joi-схем (см. п. 8.14);
bare-инклуды в userController (EagerLoadingError); роли 'admin'/'blocked' вместо
system_admin/banned; аватар без multer (всегда 400); GET /users/statistics перехватывался
/:id; privateKey в req.user; печатная форма рецептов — doctor.Specialties (несуществующее
поле) → специальность всегда N/A, заменили на specialtyDetails; композитный индекс
messages(chat_id, created_at) против filesort пагинации.
**Сервер** (d11762c → 596c4a3, E2E): модель UserKey + validators/key.js + controllers/keysController.js
+ routes/keys.js; routes/chats.js GET /:id/keys; index.js подключение /api/keys;
chatController — validateE2EEnvelope + E2E-ветка sendMessage (metadata.e2e, content='',
isEncrypted=true, lastMessageText='').
**Мобильный клиент**: /api/v1 в базовом URL; data.token vs accessToken; paymentProcess без
type; двойное списание при отправке после оплаты; локальное шифрование в useChat ломало чат
(переписан на server-first); EPrescription без patientId; register без status active;
joinChat без проверки членства; authenticate без вызова (); ChatListScreen — ReferenceError
Platform без импорта (заменили на настоящий RefreshControl); ChatScreen — аудио-ветка была
недостижима из-за item.file.
**Мобильный клиент** (d11d285 + b7962cd + 5a8eceb): { database } не экспортировался → краш
локальной БД во всех 6 экранах; initDatabase не экспортировался → TypeError на старте
+ шрифты не грузились; ChatProvider грузил историю ВСЕХ чатов N+1 и шифровал сообщения
через несуществующий privateKey; encryptionService — мёртвый сломанный код (удалён);
искусственная задержка старта 2 с (удалена).
**Мобильный клиент** (3d5bfd1 + 596c4a3, E2E): services/e2eCryptoService.js (pure JS base64/
UTF-8 — в RN нет гарантированных btoa/atob; tweetnacl уже в deps); useChat.js — регистрация
ключа при монтировании, buildE2EEnvelope с participant-проверками, шифрование при отправке,
расшифровка входящих (REST + сокет), замочек в чат-листе, локальное восстановление текста
своих сообщений (сервер его не хранит).
**Мобильный клиент** (3ab5cf6, E2E secure storage): приватные ключи из AsyncStorage →
expo-secure-store (iOS Keychain / Android Keystore, WHEN_UNLOCKED_THIS_DEVICE_ONLY),
прозрачная миграция при первом чтении, fallback на AsyncStorage только там, где secure
storage недоступен (expo web); removeLocalKeyPair чистит оба хранилища.
**Мобильный клиент** (a14ffd4, E2E UX): MessageBubble рисует 🔒 в футере сообщений
с metadata.e2e.
**Rust-ядро** (3a70911 → ee76670): крейт medchat-core (crypto_box 0.9, SalsaBox), CoreError,
джоба core-tests в CI с публикацией ci-logs/ci-rust.log; два красных прогона починены
(API-расхождения, см. п. 8.19).
**E2E-покрытие тестами** (02dc969 → 7cb0832): validateE2EEnvelope вынесена из chatController
в utils/e2eEnvelope.js (чистая функция без зависимостей) + tests/e2eEnvelope.test.js (8 кейсов:
структура, лимиты 10 боксов/32КБ/256КБ, пустые и битые боксы); smoke-секция [12] E2E (13 проверок:
регистрация и ротация ключей, 400 на невалидный publicKey, 403 на чужие ключи чата, конверт в
metadata.e2e при пустом content, 400 на plaintext рядом с конвертом и на конверт без бокса
отправителя, история без plaintext, деактивация ключа. Опечатка doctorApptsList в [8]
(ReferenceError, красный прогон #58) починена в 7cb0832.
**Честность данных E2E** (815f6cb + a508fda): прогон #59 остался красным — проверка [12]
искала E2E-сообщение по isEncrypted, а легаси-дефолт модели true делал подходящими
сид-plaintext-сообщения без конверта. Маркер заменён на metadata.e2e (единственный
честный признак конверта), легаси-дефолт Message.isEncrypted заменён на false:
plaintext-сообщения (сид, prescription из eprescriptionController.send) больше не
лгут, что зашифрованы. #61 зелёный (63/63).
**Rust-ядро: Double Ratchet** (6aff983 + fb09c846): прототип этапа 7 в src/ratchet.rs —
raw X25519 (x25519-dalek 2.0.1 с явной feature static_secrets) + KDF_RK/KDF_CK
(HMAC-SHA256) + AES-256-GCM на одноразовых message keys; 8 тестов (двусторонний
раундтрип с ratchet-шагами, replay старого сообщения → OutOfOrder, восстановление
порядка, tampering, битый заголовок). Не интегрирован в клиенты; ограничения
прототипа честно задокументированы в модуле.
**Rust-ядро: фиксы компиляции + skip-store** (7576e65 + f1faf96 + d033eeb): ratchet.rs не
компилировался — E0034 (неоднозначность KeyInit/Mac в new_from_slice → дисамбигуация
<HmacSha256 as Mac>::new_from_slice) и E0308 (byte string вместо u8-литерала в тестах),
починено 7576e65; f1faf96 добавил диагностический extra-объект в падающую проверку
smoke [12]; d033eeb — skip-store: буфер одноразовых message keys
HashMap(([u8;KEY_SIZE], u32) → [u8;32]), skip_message_keys с лимитами
MAX_SKIP=2000/MAX_SKIPPED_KEYS=500, decrypt в 3 шага (одноразовый ключ из skip-store →
DH-шаг со skip до pn → skip до n), тесты out_of_order_decoded_via_skip_store и
too_many_skipped_rejected — итог 10 тестов.
**Критический фикс: сервер не запускался** (ad575d3): a508fda внёс в models/Message.js
синтаксическую ошибку — строка 21 заканчивалась «;» вместо «,» после свойства comment
поля content → SyntaxError при загрузке модели → seed:test падал → e2e-smoke не доходила
до smoke-теста. ВАЖНЫЙ УРОК ДИАГНОСТИКИ: ci-smoke.log в репо оставался от прогона ДО
a508fda (устаревший), из-за чего «детерминированное падение проверки [12]» было
артефактом устаревшего лога. Всегда сверяй метку времени в заголовке ci-logs/*.log
с коммитом прогона, прежде чем доверять логу.
**Rust-ядро: wire-формат RatchetMessage** (a43102d): to_wire()/from_wire() для
передачи зашифрованных ratchet-сообщений между платформами (header 40 байт
dh_pub(32)+pn(4)+n(4) LE || nonce 12 || ciphertext), BadHeader на границах,
HEADER_SIZE стал pub — подготовка к napi-rs/UniFFI-биндингам; 3 новых теста
(итого 13).
**Кросс-платформенные контракт-векторы** (1ce9516): DoD Этапа 2 «тест-векторы
байт-в-байт» закрыт для примитива NaCl box — общая фикстура
core/tests/nacl_box_vector.hex (канонический вектор из дистрибуции NaCl,
public domain: ключи Alice/Bob, nonce, m 131 байт, c 147 байт) проверяется
в двух джобах: core-tests (interop_vectors.rs: SalsaBox шифрует и
расшифровывает вектор) и server-tests (coreInterop.test.js: nacl.box /
nacl.box.open на tweetnacl — библиотеке мобильного клиента). tweetnacl уже
был в dependencies сервера — новых зависимостей не потребовалось.
**Мобильный клиент: E2E файлов/голосовых** (42e5a1d → 631b324 → ed9a661):
sendFile шифрует payload на устройстве (secretbox случайным ключом; wire =
nonce || ciphertext грузится как payload.bin/octet-stream), ключ файла едет
внутри конверта сообщения (JSON { mc:2, t, k, m } — имя, ключ, исходный MIME).
Расшифровка при просмотре: fetchAndDecryptFile (Bearer обязателен — эндпоинт
/api/files/:id/download аутентифицированный) → plaintext в кэш → локальный
file:// URI для плеера/expo-sharing; кэш расшифрованных файлов на сообщение;
legacy-файлы (без ключа) качаются downloadAsync с Authorization — плеер сам
заголовок прикрепить не мог. Fallback-логика идентична тексту.
**Мобильный клиент: fingerprint чата / safety number** (347bc9d + ec1a0de):
chatFingerprint в e2eCryptoService (SHA-512 nacl.hash по отсортированным
тройкам userId|keyId|publicKey, 60 цифр группами по 5) + шапка ChatScreen
(иконка verified-user → Alert с кодом и инструкцией сверки; только для чатов
с E2E-ключами). Закрывает «верификацию fingerprint-кодов» этапа 7 в части
мобильного клиента.
**Rust-ядро: napi-rs-биндинги Node** (754f677 → 2bb38f2): src/node.rs —
тонкие обёртки (Buffer ↔ Vec<u8>, CoreError → napi::Error, длины аргументов →
InvalidArg) над generate_keypair/seal_for_recipients/open_sealed + класс
JsRatchetState (фабрики вместо constructor: две схемы инициализации;
encrypt/decrypt/decryptWire — wire a43102d) и wire-хелперы ratchetMessage
To/FromWire. Cargo.toml: crate-type cdylib+rlib, napi 2 (compat-mode, без
tokio), napi-derive 2, build.rs с napi_build::setup(). 3+3 юнит-теста
обёрток (итого 20 тестов крейта). Ограничение честно: сборка .node-артефакта
(napi-cli) в CI не настроена — core-tests проверяет компиляцию биндингов
(cargo check --tests) и тесты логики (cargo test --no-default-features).
**Контракт-векторы AES-256-GCM** (e7879a7): DoD Этапа 2 «тест-векторы
байт-в-байт» закрыт и для AEAD-пути (message keys Double Ratchet шифруются
AES-256-GCM, серверный cryptoService — тоже): три KAT-вектора из тестов
BoringSSL aes_256_gcm_tests.txt (public domain) на общей фикстуре
core/tests/aes_gcm_vector.hex (формат «key = hex», пустые значения —
«v1_pt =»; векторы: v1 — пустой pt/AAD, проверяется только tag;
v2 — 5-байтовые pt+AAD; v3 — 37-байтовый pt с 35-байтовым AAD).
Rust-сторона: aes-gcm 0.10 (core/tests/aes_gcm_vector.rs, парсер
split_once('=')) обязана воспроизвести ct||tag байт-в-байт; Node-сторона:
server/tests/coreAesGcm.test.js (crypto aes-256-gcm, authTagLength 16,
setAAD, парсер indexOf('=')) — 4+3 test.each кейсов, включая негативные
(битый tag/nonce). Обе стороны в CI: core-tests + server-tests.
**Стабилизация napi-сборки в CI** (30c3f5e → a1061cd → e411a54; серия
754f677 → bfa904f была красной, каждый фикс открывал следующий слой):
(1) 754f677: napi-build 2.6 эмитит инструкции билд-скрипта синтаксисом
cargo:: (Rust ≥ 1.77), а заявленный rust-version 1.65 заставлял cargo
отвергать билд-скрипт → MSRV поднят до 1.77 (30c3f5e) с комментарием в
Cargo.toml, чтобы не опустили обратно; (2) a1061cd: Result<Buffer,_>::
unwrap_err() не компилируется (E0277 — у napi Buffer нет Debug) →
.err().unwrap() в двух тестах node.rs; (3) e7879a7/a1061cd: cargo test
падал уже на линковке — тестовый бинарник требует napi_*-символы
(napi_create_error, napi_delete_reference, napi_reference_unref, ...),
которые в рантайме даёт только процесс Node; libnode.so в дистрибутиве
Node нет (napi-rs issue #1099), noop-рецепт из документации napi.rs не
подходит (noop не создаёт фейковый JS engine, а наши обёртки целиком на
Buffer). Решение: feature napi-bind (default) + cfg-гейт pub mod node;
CI: cargo check --tests (type-check биндингов и их тестов — ловит
E0277-класс без линковки) + cargo test --no-default-features (тесты
логики). e411a54 — зелёный во всех трёх джобах. УРОК: N-API-крейт нельзя
полноценно гонять cargo test без Node — feature-гейт планируй с самого
начала; юнит-тесты обёрток выполнимы только в Node-интеграции с .node.
**Контракт-векторы bcrypt** (8776f7c): DoD Этапа 2 закрыт и для хэшей паролей —
4 KAT-вектора из тестов OpenBSD/crypt_blowfish (Solar Designer, public domain;
cost 5, формат $2a$: U*U, U*U*, U*U*U и 72+-символьный пароль с пробелами) на
общей фикстуре core/tests/bcrypt_vector.txt (формат «ключ = значение», значение
БЕЗ тримминга — пароль v4 с внутренними пробелами). Rust-сторона: крейт bcrypt
0.15 (pure Rust, доступен и без napi-bind) + bcrypt_verify(password, hash) в
lib.rs с новым вариантом CoreError::BadHash (битый хэш — различимая ошибка, а
не Ok(false)); core/tests/bcrypt_vector.rs — все 4 вектора Ok(true), неверный
пароль Ok(false), «not-a-bcrypt-hash» → Err(BadHash). Node-сторона:
server/tests/bcryptInterop.test.js — нативный bcrypt сервера (compareSync;
authService хэширует пароли с cost 12) на той же фикстуре. 8-битные векторы
($2x$, баг 2a) осознанно исключены — реализации расходятся. УРОК: вектор по
памяти был неверен (E5YPOq... вместо E5YPO9...) — KAT-значения всегда сверять
по первоисточнику (Openwall wiki), не по памяти.
**Бенчмарки крипто-пути** (d2db23e + f79de00): DoD Этапа 2 «бенчмарк
≥ x10 к Node». Rust-сторона: benches/crypto.rs (criterion 0.5 — dev-зависимость,
target [[bench]] harness=false, в обычные прогоны ядра не входит): конверты
x25519-box (seal+open 1/3 получателя, seal; payload 30 байт), Double Ratchet
(encrypt+decrypt и полный wire-цикл), bcrypt_verify (cost 5 KAT «U*U» +
production cost 12, sample_size 10). Node-зеркало: server/bench/coreBench.js
(npm run bench:core) — tweetnacl-box мобильного клиента (эфемерная пара +
боксы по числу получателей, как seal_for_recipients), Node crypto AES-256-GCM,
нативный bcrypt compareSync; те же payload и cost, sanity-проверки (roundtrip
и KAT обязаны сходиться, иначе бенчмарк некорректен). Джоба CI core-bench
гоняет cargo bench --no-default-features и Node-референс на ОДНОМ раннере и
публикует ci-logs/ci-bench.log всегда (не только при падении): свёртка DoD
«≥ x10» читается из лога, тайминги не гейтятся автоматикой (машины
шатательны). Честно: AES-GCM в Node — нативный OpenSSL, ratchet в Node нет —
поэтому эталон сравнения — конвертный x25519-box-путь (JS tweetnacl), по нему
и ожидается ≥ x10. Первый прогон (run 42474787549, ci-logs/ci-bench.log):
Rust быстрее конвертного пути в 11.6–15.2 раза (seal+open/1: 116.8 µs
против 1.53 мс; seal+open/3: 218.4 µs против 2.53 мс; seal: 66.5 µs против
1.01 мс) — DoD «≥ x10» закрыт по эталонному пути. Double Ratchet
encrypt+decrypt: 1.92 µs (в Node реализации нет — сравнивать не с чем).
bcrypt: обе стороны нативные, Rust-крейт чуть медленнее (cost 5: 1.86 против
1.64 мс; cost 12: 233 против 206 мс) — DoD на bcrypt-путь не заявлялся.
**Fuzz-цели cargo-fuzz** (этот коммит): DoD Этапа 2 «устойчивость к мусорным
данным». Крейт fuzz/ (libfuzzer-sys 0.4, nightly, ASan): open_sealed_fuzz —
конверт из враждебных байтов (epk+nonce из входа, боксы по 64 байта):
open_sealed обязан вернуть Ok/Err, не панику; ratchet_wire_fuzz — from_wire
на произвольных байтах (Err(BadHeader) на границе) + decrypt валидного формата
отвечающей стороной (ошибки допускаются, паники нет); ratchet_roundtrip_fuzz —
сессия на настоящей X25519-паре (generate_keypair; фиктивная несогласованная
пара была причиной красных прогонов #104/#105, см. ниже), произвольный
plaintext (включая пустой) обязан вернуться байт-в-байт через to_wire/from_wire. bcrypt_verify в fuzz НЕ включена
осознанно: хэш cost 31 валиден по формату и вешает проверку на минуты (при
необходимости — отдельная цель с гейтом cost). Джоба CI fuzz-smoke: cargo
install --locked cargo-fuzz, -runs=5000 на цель (libFuzzer-флаги — после «--»),
лог ci-logs/ci-fuzz.log.
Прогоны #102 и #103 (42475946800) красные до первого запуска целей:
(1) #102 — имена шагов «fuzz: ...» содержали «: » — plain-scalar с
«двоеточие+пробел» невалиден, GitHub отверг весь workflow (Invalid workflow
file ci.yml#L401), ни одна джоба не стартовала и ci-лог не создавался вовсе —
статус видно только аннотацией на странице прогона; имена переименованы
«fuzz <target>» (6a15ca7). (2) #103 — cargo-fuzz парсит -runs=5000 как
свой аргумент (clap: unexpected argument -r): libFuzzer-флаги передаются
ПОСЛЕ «--» (cargo fuzz run <target> -- -runs=5000). УРОК: cargo-fuzz-CLI
и флаги libFuzzer-бинаря разделены «--»; «: » в name шагов GH Actions
недопустим.
Прогоны #104/#105: ratchet_roundtrip_fuzz паниковал на первом же входе
(пустой crash-файл, sha1 пустой строки) — roundtrip decrypt: Aead. Причина
в harness-е цели, НЕ в ядре: фиксированная пара
KeyPair{public_key:[0;32], secret_key:[1;32]} невалидна по построению —
public_key не соответствует secret_key (x25519([1;32]) != [0;32]):
DH-выход инициатора (DH с [0;32]) и респондента (DH с secret [1;32])
не совпадают, decrypt обязан отвечать Aead на любом входе. Фикс —
generate_keypair(), как в юнит-тестах ratchet.rs. УРОК: в X25519-паре
обе половины обязаны быть согласованы (public = x25519(secret));
фиксированные байтовые константы для ОБЕИХ половин «пары» — ошибка
по построению, а детерминированный краш на пустом входе — признак бага
в setup-е цели.
**UniFFI-биндинги Swift/Kotlin** (этот коммит): последний пункт Этапа 2
(биндинги). feature uniffi-bind (НЕ default, как napi-bind) + модуль
src/uniffi_iface.rs: MedKeyPair/MedSealedMessage/MedRatchetMessage (Record),
MedCryptoError (uniffi::Error: варианты CoreError + InvalidArgument для длин),
обёртки generate_keypair/seal_for_recipients/open_sealed/bcrypt_verify/
ratchet_message_to_wire/from_wire + константы (32/24/40/12). Отличие от
napi: uniffi-методы Object иммутабельны — MedRatchetState держит
Mutex<RatchetState> (poison обходится into_inner). Джоба CI uniffi-bindings:
cargo build --release --no-default-features --features uniffi-bind (cdylib с
setup_scaffolding!-метаданными), uniffi-bindgen 0.28.3 (library mode) генерирует
Kotlin- и Swift-обвязку в uniffi-out/ (артефакт upload-artifact), плюс
cargo test обёрток — в отличие от napi, uniffi-код линкуется в тестовый
бинарник чисто (metadata — обычный Rust). Версия 0.28.3 закреплена с обеих сторон: крейт и CLI берутся из
git-тега v0.28.3 репозитория mozilla/uniffi-rs (формат metadata меняется
между minor — CLI обязан совпадать с крейтом). Прогоны #105–#107:
установка CLI падала — «could not find uniffi-bindgen in registry
crates-io» на любую версию. Причина (диагностируемый ci-uniffi.log +
ручные пробы sparse-индекса): семейство uniffi-крейтов ОТСУТСТВУЕТ
в sparse-индексе crates.io — index.crates.io/un/iff/uniffi* отвечает
NoSuchKey (контроль: serde/crypto_box/x25519-dalek/generic-array
отдаются), при живых метаданных crates.io API (0.28.3 существует, не
yanked, линейка до 0.32.2). cargo не может разрешить зависимость из
отсутствующей индексной записи — ни --version, ни фолбэк без --locked
не спасают. Фикс: зависимость крейта и установка CLI переведены на
git-тег v0.28.3 (внутренние зависимости uniffi — uniffi-macro,
uniffi-meta — path-депы того же workspace, обращений к отсутствующим
индекс-записям не остаётся; Cargo.lock в gitignore). УРОКИ:
(1) шаги ДО первого tee невидимы для ci-reporter — потенциально
капризный шаг обязан писать лог с самого начала (#105: причина была
недиагностируема, пока лог не стал писаться с первой команды;
заголовок прогона — для сверки метки времени, cargo --version —
контекст); (2) «крейта нет в реестре» ≠ «крейт не существует»:
crates.io API и sparse-индекс cargo расходятся — при «could not find
in registry» проверять index.crates.io/<2 буквы>/<2 буквы>/<имя>
напрямую (NoSuchKey) и держать в голове git-тег как альтернативный
источник пина версии. Честное ограничение:
компиляция сгенерированного кода в Xcode/Gradle — этапы 3/4 (на ubuntu их
нет); джоба гейтит сборку, тесты обёрток и генерацию.
**CI**: npm workspaces тянул expo/RN при установке сервера (ERESOLVE) → workspaces удалены;
несуществующие версии пакетов (yookassa ^3.0.0 убран, rate-limit-redis ^7 → ^4.0.0).
**Security** (1fafeb9): self-registration clinic_admin; клиентская цена платежа; JWT без
пиннинга HS256 — всё исправлено, покрыто tests/security/.

## 9. Лаунчер («запуск по кнопке»)

`medchat-v2/launcher/`:
```
node launch.js clinic|doctor|patient|all   # или без аргумента — меню 1-4
node stop.js [--docker]                     # остановить процессы (и контейнеры)
```
- Поднимает docker postgres/redis/minio, npm install + seed:test при первом запуске,
  health-check :3000, web-клиент на :3002 (REACT_APP_API_URL, BROWSER=none),
  Expo для пациента, PID-файл `launcher/.run/pids.json`.
- **Удаление папки безопасно**: `launcher/` — самостоятельный модуль, код проекта на него
  не ссылается. Порядок: `node stop.js` → `rm -rf medchat-v2/launcher` → `docker compose down`
  (если поднимал контейнеры). Подробно — launcher/README.md.

## 10. CI (.github/workflows/ci.yml)

Семь джоб на каждый пуш в main:
- **server-tests**: `npm ci` + `jest --ci --runInBand` (unit + integration + security;
  БД мокается, Postgres не нужен; с 02dc969 включает tests/e2eEnvelope.test.js — 8 юнит-кейсов
  валидации E2E-конвертов; с 1ce9516 — tests/coreInterop.test.js: канонический
  вектор NaCl crypto_box на фикстуре core/tests/nacl_box_vector.hex — tweetnacl
  обязан совпадать с эталоном и с Rust-ядром байт-в-байт; с e7879a7 —
  tests/coreAesGcm.test.js: KAT-векторы AES-256-GCM из BoringSSL на фикстуре
  core/tests/aes_gcm_vector.hex — Node crypto обязан совпасть с Rust байт-в-байт.
  С 8776f7c — tests/bcryptInterop.test.js: KAT-векторы bcrypt из
  OpenBSD/crypt_blowfish на фикстуре core/tests/bcrypt_vector.txt — серверный
  нативный bcrypt обязан совпасть с bcrypt_verify ядра.
  При ошибке установки grep npm error выводится в annotations.
- **e2e-smoke**: services Postgres (db medchat_test) + Redis; `npm run seed:test` +
  `npm run test:smoke` (сервер на :3990, сам поднимается). С 623d777 включает секцию [12] E2E:
  +13 проверок реестра ключей и конвертов (ротация, 403 на чужие ключи, plaintext-защита).
- **core-tests**: Rust-ядро medchat-v2/core — stable-тулчейн, кэш (Swatinem/rust-cache),
  два шага (с e411a54): `cargo check --tests` (компиляция ядра + napi-биндингов
  src/node.rs и их #[cfg(test)]-кода; type-check без линковки — napi_*-символы
  тестовому бинарнику дать некому, их даёт только процесс Node, napi-rs issue
  #1099) и `cargo test --no-default-features` (тесты логики ядра: lib + ratchet
  (Double Ratchet, 13 кейсов с skip-store) + контрактные векторы
  interop_vectors.rs, aes_gcm_vector.rs и bcrypt_vector.rs). Лог падений публикуется в
  ci-logs/ci-rust.log. 6 юнит-тестов самих napi-обёрток компилируются
  (check), а в настоящем Node они выполняются джобой napi-build (napi-smoke.js
  — JS-зеркало тех же проверок против собранного .node-артефакта).
- **core-bench** (f79de00): cargo bench --no-default-features (criterion,
  release+LTO; benches/crypto.rs — d2db23e) + Node-референс npm run
  bench:core на том же раннере; лог ci-bench.log публикуется в ci-logs/
  ВСЕГДА (числа для сверки DoD «≥ x10»; тайминги машин шатательны — не
  автогейт). Джоба гейтит сборку и прогон бенчмарков (паника в бенче =
  красный прогон).
- **napi-build**: cargo build --release (cdylib, дефолтные фичи с napi-bind) →
  rename в medchat-core.linux-x64-gnu.node; node napi-smoke.js — Node-интеграция
  обёрток (то, что cargo test дать не может: линковка napi_*, issue #1099);
  артефакт через actions/upload-artifact@v4; лог падений — ci-logs/ci-napi.log.
- **fuzz-smoke**: cargo-fuzz (nightly + ASan) — три цели: open_sealed_fuzz
  (враждебный конверт с сети: Ok/Err без паники), ratchet_wire_fuzz (мусорный
  wire: Err(BadHeader) на границе формата, decrypt валидного — ошибки допустимы),
  ratchet_roundtrip_fuzz (произвольный plaintext, включая пустой, обязан вернуться
  байт-в-байт); -runs=5000 на цель — smoke, суточный DoD-прогон — отдельный запуск
  по требованию; лог падений — ci-logs/ci-fuzz.log.
- **uniffi-bindings**: UniFFI-биндинги Swift/Kotlin (этап 2): сборка cdylib
  с scaffolding (--no-default-features --features uniffi-bind) → uniffi-bindgen
  0.28.3 из git-тега v0.28.3 (library mode) генерирует Kotlin/Swift-обвязку
  (uniffi-out/, артефакт);
  cargo тестов обёрток (uniffi-метаданные — обычный Rust, линкуются чисто,
  в отличие от napi); лог падений — ci-logs/ci-uniffi.log. Компиляция
  сгенерированного кода в Xcode/Gradle — этапы 3/4, на ubuntu недоступна.
- env: NODE_ENV=test, JWT_SECRET=ci-e2e-secret, MESSAGE_PRICE_RUB=50,
  FREE_MESSAGE_DAYS=30, DOCTOR_SHARE_PERCENT=80.
- CI зелёный: 3ef9ff0/#30, 65ec99c/#31, E2E-серия d11762c → 596c4a3 (runs #38–#43),
  ee76670/#52 (все три джобы, включая core-tests), 02dc969/#57 (E2E-конверты под юнит-тестами).
  623d777/#58 красный (опечатка в smoke, см. историю фиксов), починен 7cb0832;
  #59/#60 красные (легаси-дефолт isEncrypted=true ловил сид-plaintext в проверке [12]),
  починено 815f6cb (маркер metadata.e2e; #61 зелёный, 63/63) + a508fda (честный дефолт false).
  СЕРИЯ #62–#69 красная, две независимые причины: (1) a508fda внёс синтаксическую
  ошибку в models/Message.js (см. историю фиксов) — seed падал раньше smoke, а
  ci-smoke.log в репо оставался УСТАРЕВШИМ (от прогона до a508fda), из-за чего падение
  проверки [12] казалось детерминированным — артефакт устаревшего лога; фикс ad575d3.
  (2) ratchet.rs не компилировался (E0034/E0308) — починено 7576e65; d033eeb добавил
  skip-store (10 тестов), f1faf96 — диагностический extra в smoke [12]. После ad575d3 серия зелёная:
  ad575d3, 9fdae90 (доки), a43102d (wire-формат ratchet, 13 тестов),
  42e5a1d (E2E файлов; 631b324/ed9a661 меняют только mobile — в CI
  не тестируется). Серия napi-биндингов с 754f677 была красной по цепочке
  причин (MSRV билд-скрипта → Debug у Buffer → линковка napi_*-символов,
  см. историю фиксов): 754f677, 2bb38f2, bfa904f, 30c3f5e, e7879a7,
  a1061cd — красные; e411a54 (feature napi-bind) — зелёный во всех трёх
  джобах, серия закрыта. Далее eed2ddb/e2e42c3/edc65e2 (доки), 8776f7c добавил
  векторные тесты bcrypt в server-tests и core-tests (см. выше). Серия бенчмарков:
  d2db23e (criterion, benches/crypto.rs) и f79de00 (Node-зеркало + джоба
  core-bench, лог публикуется при любом исходе; первый прогон 42474787549 — DoD
  «≥ x10» закрыт: конвертный x25519-box-путь 11.6–15.2x в пользу Rust). Джоба napi-build — сборка .node-артефакта + Node-интеграция
  обёрток (napi-smoke.js). Джоба fuzz-smoke — cargo-fuzz (три цели,
  ограниченные итерации; прогоны #102/#103 красные по мелочи — «: » в именах
  шагов YAML и libFuzzer-флаги после «--»; #104/#105 — фиктивная X25519-пара
  в harness ratchet_roundtrip_fuzz (decrypt Aead на любом входе; фикс
  856b636 — generate_keypair, урок в §8; прогоны #106/#107 — fuzz-smoke
  зелёная, все три цели проходят smoke-итерации). Джоба uniffi-bindings —
  генерация Swift/Kotlin-обвязки ядра (этап 2 закрыт; прогоны #105–#107:
  uniffi-крейтов нет в sparse-индексе crates.io — крейт и CLI переведены
  на git-тег v0.28.3, уроки в §8). Логи
  падений бот ci-reporter
  коммитит в `ci-logs/` (ci-smoke.log / ci-jest.log / ci-rust.log / ci-seed.log / ci-napi.log / ci-fuzz.log / ci-uniffi.log; ci-bench.log пишется при любом исходе) — при
  красном прогоне читать оттуда.

## 11. Что осталось сделать (roadmap)

1. ~~Добить CI до зелёного~~ — зелёный с 3ef9ff0/#30 и 65ec99c/#31; держать зелёным.
2. ~~E2E-шифрование~~ — **реализовано** (d11762c → 596c4a3): X25519 + NaCl box, реестр
   ключей UserKey, конверты в Message.metadata, graceful fallback. Остаточное (в порядке
   приоритета): интеграция Double Ratchet (прототип в ядре готов — ratchet.rs, 6aff983;
   wire-формат заголовков готов (a43102d), napi-биндинги JsRatchetState готовы;
   skip-store сделан d033eeb); ~~E2E для файлов/голосовых~~ — сделано
   (42e5a1d → ed9a661: гибридное шифрование, ключ файла в конверте,
   расшифровка при просмотре); ~~верификация fingerprint-кодов~~ — сделано
   (347bc9d + ec1a0de: safety number в шапке чата); идентификация
   пользователей 149-ФЗ ст. 10.1. ~~Secure storage приватных ключей~~ —
   сделано (3ab5cf6: expo-secure-store / Keychain / Keystore, миграция из AsyncStorage).
3. ~~Фейл-фаст валидация JWT_SECRET при старте сервера~~ — сделано (65ec99c).
4. ~~Вырезать privateKey из req.user~~ — сделано (65ec99c).
5. Подписи вебхуков (когда/если появятся реальные шлюзы).
6. Прод-инфраструктура: nginx, TLS, регулярные бэкапы (backupService есть, cron нет).
7. UI-полировка мобилки, локализация, тёмная тема.
8. Пагинация/виртуализация длинных чатов в мобильном клиенте.
9. Webhook-заглушки (п. 8.4) — при подключении реальных шлюзов.
10. Нативные клиенты и Rust-ядро — см. ROADMAP_NATIVE.md (iOS/Android native, Tauri
    desktop Windows/Linux, крипто-ядро на Rust/C++). **Этап 2 начат**: крейт medchat-core
    (3a70911 → ee76670) + джоба core-tests в CI. **Контракт-векторы DoD**: NaCl box
    (1ce9516), AES-256-GCM (e7879a7) и bcrypt (8776f7c: KAT-векторы
    OpenBSD/crypt_blowfish, bcrypt_verify ядра + нативный bcrypt сервера на
    общей фикстуре) — все три пути закрыты. **Double Ratchet: прототип готов**
    (6aff983 + d033eeb: ratchet.rs с skip-store, 13 тестов, forward secrecy + break-in
    recovery + внеочередная доставка; в клиенты не интегрирован). ~~napi-rs-биндинги
    для Node~~ — сделано (754f677 → 2bb38f2 → e411a54: src/node.rs, конверты +
    JsRatchetState, feature napi-bind — CI зелёный). ~~UniFFI для Swift/Kotlin~~ — сделано (feature uniffi-bind: src/uniffi_iface.rs,
    обёртки конвертов + bcrypt + MedRatchetState (Mutex), генерация обвязки —
    джоба uniffi-bindings; склейка в Xcode/Gradle — этапы 3/4). Дальше:
    интеграция ratchet в клиенты, ~~cargo-fuzz~~ (scaffold: fuzz/ с тремя целями + джоба fuzz-smoke;
    суточный DoD-прогон — отдельный запуск по требованию), ~~бенчмарки (DoD ≥ x10
    к Node)~~ — сделано (d2db23e + f79de00: criterion + Node-зеркало + джоба
    core-bench; первый прогон 42474787549: конвертный путь 11.6–15.2x — DoD закрыт),
    ~~сборка .node-артефакта в CI + Node-интеграция юнит-тестов обёрток~~ —
    сделано (джоба napi-build: medchat-core.linux-x64-gnu.node + napi-smoke.js,
    артефакт через upload-artifact).

---

*Документ поддерживай актуальным при крупных изменениях: он — первое, что читает
следующий ИИ-агент (или человек) перед продолжением работы.*

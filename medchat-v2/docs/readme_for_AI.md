# readme_for_AI — полная карта MedChat v2 для ИИ-агентов

> Этот документ написан для ИИ-ассистентов, которые будут продолжать работу над проектом.
> Здесь: структура, контракты, бизнес-логика, а главное — честный разбор,
> что реализовано «по-настоящему», а где временные заплатки и осознанные компромиссы.
> Обновлён после security-аудита (коммит 1fafeb9), серии фиксов
> 65ec99c → 5a8eceb (user-API, печатная форма рецептов, чистка мёртвого шифрования мобилки),
> серии E2E-коммитов d11762c → 596c4a3 (сквозное шифрование содержимого сообщений —
> см. раздел 5, «E2E-контракт»), каркаса Rust-ядра medchat-core с джобой core-tests
> в CI (3a70911 → ee76670), перевода приватных ключей в Keychain/Keystore (3ab5cf6)
> и покрытия E2E тестами (02dc969 → 7cb0832: юнит-тесты валидатора конвертов +
> smoke-секция E2E [12]) и наведение честности данных (815f6cb → a508fda:
> маркер E2E-сообщения в smoke — metadata.e2e; честный дефолт
> Message.isEncrypted=false — легаси true ложно помечал plaintext).

---

## 1. Что это за проект

MedChat v2 — телемедицинская платформа «клиника — врачи — пациенты»:

- **Чаты** пациент ↔ врач: текст, голосовые (expo-av, m4a), файлы; Socket.IO real-time.
- **E2E-шифрование содержимого текстовых сообщений** (X25519 + NaCl box, шифрование
  на устройстве, сервер хранит только шифротекст — раздел 5).
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
| core | Rust-ядро medchat-core (этап 2 ROADMAP_NATIVE): X25519 + NaCl box (SalsaBox, crypto_box 0.9), совместимо с мобильным клиентом |
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
├── server/tests/
│   ├── cryptoService.test.js, errorHandler.test.js, paymentService.test.js,
│   │                    e2eEnvelope.test.js (валидация E2E-конвертов, 02dc969)
│   ├── integration/auth.test.js
│   └── security/      — jwtSecurity, registerSecurity, paymentsSecurity, transactionsIdor
├── mobile/src/
│   ├── config/config.js        — API_URL http://localhost:3000 (БЕЗ /api/v1)
│   ├── context/ (3)            — AuthContext (pass-through), ThemeContext,
│   │                            NotificationContext (ChatContext УДАЛЁН, см. п. 8.5)
│   ├── hooks/ (4)              — useChat (server-first чат + интеграция E2E), useAuth, ...
│   ├── screens/ (19)           — Login, Register, ChatList, Chat, Payment,
│   │                            Appointments, EPrescriptions, Profile, ...
│   ├── services/ (9)           — authService, chatService (socket+REST), api, file,
│   │                            payment, database (экспортирует database + initDatabase),
│   │                            notification, backup, e2eCryptoService (X25519 E2E:
│   │                            base64/UTF-8 pure JS, keypair в expo-secure-store
│   │                            (Keychain/Keystore) с fallback и миграцией, конверты,
│   │                            расшифровка)
│   ├── components/ (8)         — MessageBubble (🔒 на E2E-сообщениях), AudioPlayer, ...
│   ├── navigation/, styles/, utils/
├── web/src/             — pages (7), services, context
├── core/                — Rust-ядро medchat-core (Cargo.toml, src/lib.rs):
│                          SalsaBox (X25519 + XSalsa20-Poly1305, crypto_box 0.9),
│                          generate_keypair / seal_for_recipients / open_sealed,
│                          CoreError; cargo test в CI (джоба core-tests)
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

### E2E-контракт (сквозное шифрование сообщений, d11762c → 596c4a3)
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
- **Rust-ядро** (medchat-v2/core, крейт medchat-core): те же примитивы на crypto_box 0.9
  (SalsaBox = X25519 + XSalsa20-Poly1305) — generate_keypair / seal_for_recipients /
  open_sealed, CoreError; бинарно совместимая раскладка боксов с tweetnacl. Этап 2
  ROADMAP_NATIVE; биндинги (napi-rs / UniFFI) — следующие шаги.
- **Админы** (clinic_admin/system_admin) **не являются участниками E2E-переписки** и
  прочитать содержимое E2E-сообщений не могут — осознанное свойство end-to-end модели.
- **Остаточные ограничения** (честно): файлы/голосовые пока вне E2E-конвертов;
  метаданные видимы серверу; нет Double Ratchet (forward secrecy) — этап 7
  ROADMAP_NATIVE.md; AsyncStorage остаётся fallback-хранилищем приватного ключа только
  на платформах без secure storage (expo web).

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
   метаданные видимы серверу, файлы вне E2E-контура (см. LEGAL.md §2). Приватные ключи
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
отправителя, история без plaintext, деактивация ключа). Опечатка doctorApptsList в [8]
(ReferenceError, красный прогон #58) починена в 7cb0832.
**Честность данных E2E** (815f6cb + a508fda): прогон #59 остался красным — проверка [12]
искала E2E-сообщение по isEncrypted, а легаси-дефолт модели true делал подходящими
сид-plaintext-сообщения без конверта. Маркер заменён на metadata.e2e (единственный
честный признак конверта), легаси-дефолт Message.isEncrypted заменён на false:
plaintext-сообщения (сид, prescription из eprescriptionController.send) больше не
лгут, что зашифрованы. #61 зелёный (63/63).
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

Три джобы на каждый пуш в main:
- **server-tests**: `npm ci` + `jest --ci --runInBand` (unit + integration + security;
  БД мокается, Postgres не нужен; с 02dc969 включает tests/e2eEnvelope.test.js — 8 юнит-кейсов
  валидации E2E-конвертов). При ошибке установки grep npm error выводится в annotations.
- **e2e-smoke**: services Postgres (db medchat_test) + Redis; `npm run seed:test` +
  `npm run test:smoke` (сервер на :3990, сам поднимается). С 623d777 включает секцию [12] E2E:
  +13 проверок реестра ключей и конвертов (ротация, 403 на чужие ключи, plaintext-защита).
- **core-tests**: Rust-ядро medchat-v2/core — stable-тулчейн, кэш (Swatinem/rust-cache),
  `cargo test` (крейт medchat-core, этап 2 ROADMAP_NATIVE); лог падений публикуется в
  ci-logs/ci-rust.log.
- env: NODE_ENV=test, JWT_SECRET=ci-e2e-secret, MESSAGE_PRICE_RUB=50,
  FREE_MESSAGE_DAYS=30, DOCTOR_SHARE_PERCENT=80.
- CI зелёный: 3ef9ff0/#30, 65ec99c/#31, E2E-серия d11762c → 596c4a3 (runs #38–#43),
  ee76670/#52 (все три джобы, включая core-tests), 02dc969/#57 (E2E-конверты под юнит-тестами).
  623d777/#58 красный (опечатка в smoke, см. историю фиксов), починен 7cb0832;
  #59/#60 красные (легаси-дефолт isEncrypted=true ловил сид-plaintext в проверке [12]),
  починено 815f6cb (маркер metadata.e2e; #61 зелёный, 63/63) + a508fda (честный дефолт false). Логи падений бот ci-reporter
  коммитит в `ci-logs/` (ci-smoke.log / ci-jest.log / ci-rust.log / ci-seed.log) — при
  красном прогоне читать оттуда.

## 11. Что осталось сделать (roadmap)

1. ~~Добить CI до зелёного~~ — зелёный с 3ef9ff0/#30 и 65ec99c/#31; держать зелёным.
2. ~~E2E-шифрование~~ — **реализовано** (d11762c → 596c4a3): X25519 + NaCl box, реестр
   ключей UserKey, конверты в Message.metadata, graceful fallback. Остаточное (в порядке
   приоритета): Double Ratchet (forward secrecy); E2E для файлов/голосовых;
   идентификация пользователей 149-ФЗ ст. 10.1. ~~Secure storage приватных ключей~~ —
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
    (3a70911 → ee76670) + джоба core-tests в CI. Дальше: napi-rs-биндинги для Node,
    UniFFI для Swift/Kotlin, Double Ratchet поверх ядра.

---

*Документ поддерживай актуальным при крупных изменениях: он — первое, что читает
следующий ИИ-агент (или человек) перед продолжением работы.*

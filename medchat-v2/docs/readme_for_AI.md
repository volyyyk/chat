# readme_for_AI — полная карта MedChat v2 для ИИ-агентов

> Этот документ написан для ИИ-ассистентов, которые будут продолжать работу над проектом.
> Здесь: структура, контракты, бизнес-логика, а главное — честный разбор,
> что реализовано «по-настоящему», а где временные заплатки и осознанные компромиссы.
> Обновлён после security-аудита (коммит 1fafeb9).

---

## 1. Что это за проект

MedChat v2 — телемедицинская платформа «клиника — врачи — пациенты»:

- **Чаты** пациент ↔ врач: текст, голосовые (expo-av, m4a), файлы; Socket.IO real-time.
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
| mobile | React Native / Expo 48 (все роли, основной сценарий — пациент) |
| web | React (порт 3002, клиника/админ) |
| infra | docker-compose (postgres, redis, minio), GitHub Actions |

## 3. Структура проекта

```
medchat-v2/
├── server/src/
│   ├── config/        — database.js, redis.js, minio.js
│   ├── controllers/   — 16: auth, user, chat, message, file, payment, transaction,
│   │                    appointment, eprescription, clinic, doctor, patient,
│   │                    notification, backup, webhook, admin, specialty
│   ├── middleware/    — auth (JWT+RBAC), validation (Joi), upload (multer),
│   │                    errorHandler (AppError), rateLimit, sanitize, audit
│   ├── models/        — 34 модели Sequelize (User, Doctor, Patient, Clinic, Chat,
│   │                    Message, File, Transaction, Balance, BalanceReserve,
│   │                    Appointment, EPrescription, ChatParticipant, RefreshToken, ...)
│   ├── routes/        — 17 файлов (auth, chats, messages, files, payments,
│   │                    transactions, appointments, eprescriptions, users, clinics, ...)
│   ├── seeds/         — testData.js (npm run seed:test): аккаунты, балансы, приёмы
│   ├── services/      — authService, paymentService, balanceService, cryptoService,
│   │                    notificationService, encryptionService, backupService
│   ├── utils/         — logger (winston), chatAccess (canAccessChat)
│   ├── validators/    — 15 Joi-схем (auth, chat, message, file, payment, transaction, ...)
│   └── index.js       — Express bootstrap + Socket.IO (joinChat/typing/newMessage)
├── server/tests/
│   ├── cryptoService.test.js, errorHandler.test.js, paymentService.test.js
│   ├── integration/auth.test.js
│   └── security/      — jwtSecurity, registerSecurity, paymentsSecurity, transactionsIdor
├── mobile/src/
│   ├── config/config.js        — API_URL http://localhost:3000 (БЕЗ /api/v1)
│   ├── context/ (3)            — AuthContext (pass-through), ThemeContext, ...
│   ├── hooks/ (4)              — useChat (server-first чат), useAuth, ...
│   ├── screens/ (19)           — Login, Register, ChatList, Chat, Payment,
│   │                            Appointments, EPrescriptions, Profile, ...
│   ├── services/ (9)           — authService, chatService (socket+REST),
│   │                            encryptionService (см. п. 8.6!), api, file, payment, ...
│   ├── components/ (8)         — MessageBubble, AudioPlayer, ...
│   ├── navigation/, styles/, utils/
├── web/src/             — pages (7), services, context
├── launcher/            — launch.js, stop.js, README.md — «запуск по кнопке», ПАПКА УДАЛЯЕМАЯ
├── docs/                — API, ARCHITECTURE, DEPLOYMENT, GETTING_STARTED, LEGAL, OFFER,
│                          PRIVACY_POLICY, SECURITY_AUDIT + этот файл
├── docker/, docker-compose.yml
└── .github/workflows/ci.yml
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

### Чаты и сообщения
- `GET /api/chats`, `POST /api/chats`, `GET /api/chats/:id/messages?page&limit` (default 50,
  ответ `{data: [хронология], pagination}`)
- `POST /api/chats/:id/messages` `{content, type, attachments?, paymentTransactionId?}`
  - с `paymentTransactionId`: проверка Transaction (status=completed, type=message_payment,
    **одноразовость** — повтор → 409);
  - без: `PaymentService.resolveMessageFree`; если не free — **авто-списание** с тестового
    баланса (50 ₽), при нехватке средств → 402 PAYMENT_REQUIRED.
- ENUM типов сообщений: `text, image, video, audio, file, system, payment, prescription,
  appointment, reminder`; attachments — массив UUID файлов (привязка через File.update).

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
- Сервер эмитит: `newMessage` (полный JSON сообщения с sender/receiver/files includes),
  `chatUpdated`, `messageRead`.
- Мобильный `useChat.js` — **server-first**: сокет + REST-fallback, дедупликация newMessage,
  re-join на реконнект ('connect'), оптимистичная отправка (tmp-* id, замена по ответу,
  402 → человекочитаемая ошибка).

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
5. **Мобильное E2E-шифрование**: `services/encryptionService.js` (tweetnacl, локальная БД)
   существует и ключи генерируются при регистрации, НО чат — server-first и шифрование
   НЕ использует. Это мёртвый код: либо реально включить, либо удалить (roadmap).
6. **AuthContext (mobile)** — тонкий pass-through на authService + стабы
   verifyClinicCode/checkDoctorVerification (UI ждёт эти методы, реальной серверной
   проверки кода клиники в мобильном флоу нет — она есть на сервере при register doctor).
7. **Лаунчер** НЕ поднимает контейнер server из docker-compose — сервер ставится и
   запускается npm'ом напрямую; докер используется только для postgres/redis/minio.
8. **authenticate** кладёт `privateKey` в `req.user` (включается редко, но утечбельно) —
   вырезать (roadmap).
9. **userController.checkEmail/checkUsername** — публичное раскрытие существования аккаунта
   (enumeration вектор). Нужен для UX регистрации, прикрыт rate-limit'ом; для прода —
   подумать (capcha/отключение).
10. **JWT_SECRET** деструктурируется при загрузке middleware/auth.js; отсутствие секрета
    при старте НЕ валидируется (в CI/тестах/launcher задан). Перед продом — фейл-фаст проверка.
11. **updateMe** (userController) позволяет менять email/username без повторной верификации.
12. **Payout** — в тестовом режиме сразу status=completed (реальных выводов нет по требованию).
13. **Лаунчер-README** обещает «npm install при первом запуске» — ставит и server, и web,
    и mobile (expo) по необходимости; Expo-интерактив может требовать выбора аккаунта.

### История критических багфиксов (эта серия коммитов, ноябрь 2026)
**Сервер**: req.file vs req.files (все загрузки падали 400); file.buffer пуст при diskStorage;
нет audio/m4a|mp4|aac|webm в MIME-листе (голосовые expo-av не грузились); AuditLog с
несуществующими полями; cleanupExpired без logger;Attachments не привязывались к сообщению.
**Мобильный клиент**: /api/v1 в базовом URL; data.token vs accessToken; paymentProcess без
type; двойное списание при отправке после оплаты; локальное шифрование в useChat ломало чат
(переписан на server-first); EPrescription без patientId; register без status active;
joinChat без проверки членства; authenticate без вызова (); ChatListScreen — ReferenceError
Platform без импорта (заменили на настоящий RefreshControl); ChatScreen — аудио-ветка была
недостижима из-за item.file.
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

- **server-tests**: `npm ci` + `jest --ci --runInBand` (unit + integration + security;
  БД мокается, Postgres не нужен). При ошибке установки grep npm error выводится в annotations.
- **e2e-smoke**: services Postgres (db medchat_test) + Redis; `npm run seed:test` +
  `npm run test:smoke` (сервер на :3990, сам поднимается).
- env: NODE_ENV=test, JWT_SECRET=ci-e2e-secret, MESSAGE_PRICE_RUB=50,
  FREE_MESSAGE_DAYS=30, DOCTOR_SHARE_PERCENT=80.

## 11. Что осталось сделать (roadmap)

1. Добить CI до зелёного (следить за прогонами после каждого коммита).
2. E2E-шифрование чата: включить по-настоящему или удалить encryptionService.
3. Фейл-фаст валидация JWT_SECRET при старте сервера.
4. Вырезать privateKey из req.user в middleware/auth.js.
5. Подписи вебхуков (когда/если появятся реальные шлюзы).
6. Прод-инфраструктура: nginx, TLS, регулярные бэкапы (backupService есть, cron нет).
7. UI-полировка мобилки, локализация, тёмная тема.
8. Пагинация/виртуализация длинных чатов в мобильном клиенте.

---

*Документ поддерживай актуальным при крупных изменениях: он — первое, что читает
следующий ИИ-агент (или человек) перед продолжением работы.*

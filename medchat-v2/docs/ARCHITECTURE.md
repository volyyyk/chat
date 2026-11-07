# Архитектура MedChat v2.0

## Обзор

```
 Пациент (mobile)   Врач (mobile+web)   Админ клиники (web)
        \                |                  /
         \               |                 /
          (HTTPS/WSS, TLS 1.2+)
                    |
        [ API Gateway: Express ]
        [ WebSocket: Socket.IO ]
                    |
   +----------------+----------------+
   |   Business logic (services)    |
   | auth, chat, file, payment,     |
   | backup, notification, cleanup  |
   +----------------+----------------+
   |     PostgreSQL    Redis    MinIO|
   +--------------------------------+
```

## Компоненты

### Сервер (medchat-v2/server)
- **Routes**: auth, users, clinics, doctors, patients, chats, messages,
  files, payments, transactions, backups, specialties, reviews,
  appointments, eprescriptions, reminders, webhooks.
- **Middleware**: authenticate/authorize (роли), validation (Joi),
  rateLimiter (Redis), upload (multer → MinIO), errorHandler.
- **Services**: authService (JWT+refresh, bcrypt), cryptoService
  (X25519 ECDH + XChaCha20-Poly1305), paymentService (тестовый баланс,
  разделение 80/20 врач/клиника), fileCleanupService (автоудаление
  файлов через 3 дня), notificationService, backupService.
- **Realtime**: Socket.IO, комнаты user/clinic/chat, typing, read.

### Мобильное приложение (medchat-v2/mobile, Expo)
- Экраны: Splash, ModeSelection, PatientSetup (QR), AddChat (сканер
  QR + ручной код), ChatList (поиск, QR, настройки), Chat, DoctorInfo,
  Payment (тестовый баланс), PatientFiles (сортировка время/название),
  Consent (152-ФЗ), Backup (облачные копии с паролем), Settings,
  DoctorLogin/Register (код клиники + подтверждение клиникой).
- Локальное хранение: SQLite (expo-sqlite) + AsyncStorage.

### Веб-кабинет (medchat-v2/web, React 18)
- Вход: логин + пароль + код клиники; регистрация врача (аккаунт
  активируется после подтверждения клиникой, иначе сообщение
  «обратитесь к руководству клиники»).
- Дашборд, чаты (Socket.IO), файлы (сортировка/поиск/загрузка),
  настройки (профиль, тарифы, удобное время, бэкапы с паролем,
  экспорт/импорт локально, смена пароля).

## Поток обмена ключами

1. При регистрации/входе клиент генерирует пару X25519.
2. Открытые ключи участников чата обмениваются через сервер.
3. Общий секрет ECDH → ключ шифрования (SHA-256).
4. Сообщения шифруются XChaCha20-Poly1305 на устройстве; сервер видит
   только шифротекст и метаданные доставки.

## Платежи (тестовый режим)

- Бесплатное окно: N дней после последнего приема (по умолчанию 30).
- После окна: цена за сообщение (по умолчанию 50 ₽), распределение
  80% врачу / 20% клинике.
- Пакеты: 10/50/100 сообщений и безлимит на месяц.
- Все операции — через тестовый баланс; реальные шлюзы отключены.

## Хранение данных

- PostgreSQL (РФ): учетные записи, чаты, метаданные, транзакции.
- MinIO: файлы (TTL 3 дня для загрузок врача), зашифрованные бэкапы.
- Redis: сессии, rate limiting, кэш.
- Устройства: локальная история (SQLite), ключи шифрования.

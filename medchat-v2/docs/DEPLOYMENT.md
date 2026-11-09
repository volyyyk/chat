# Развертывание MedChat v2.0

## 1. Состав системы

- **server/** — Node.js 22+, Express, Socket.IO, PostgreSQL, Redis, MinIO
- **web/** — React 18 (кабинет врача для ПК)
- **mobile/** — React Native / Expo (пациенты и врачи)

## 2. Быстрый старт (Docker)

```bash
cp medchat-v2/server/.env.example medchat-v2/server/.env
cd medchat-v2/docker
docker compose up -d
```

После старта:
- API: http://localhost:3000
- Swagger: http://localhost:3000/api-docs
- WebSocket: ws://localhost:3000

## 3. Переменные окружения (server)

| Переменная | Назначение |
|---|---|
| DATABASE_URL | Подключение PostgreSQL (только РФ-хостинг) |
| REDIS_URL | Кэш, rate limiting |
| JWT_SECRET, JWT_REFRESH_SECRET | Секреты токенов (min 32 символа) |
| MINIO_ENDPOINT/ACCESS_KEY/SECRET | Хранилище файлов |
| CORS_ORIGIN | Разрешенные источники (web-кабинет, мобильные) |
| FILE_TTL_DAYS | Автоудаление файлов врача (по умолчанию 3) |
| TEST_BALANCE_ENABLED | Тестовый баланс платежей (true до подключения эквайринга) |

## 4. Запуск без Docker

```bash
cd medchat-v2/server
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

```bash
cd medchat-v2/web
cp .env.example .env   # REACT_APP_API_URL=https://api.medchat.example
npm install
npm start
```

Мобильное приложение: `cd medchat-v2/mobile && npm install && npx expo start`.
Для APK/AAB — EAS Build (expo).

## 5. Продакшн-требования

- TLS 1.2+ на обратном прокси (Nginx/Caddy), редирект HTTP → HTTPS;
- базы данных только на территории РФ (242-ФЗ);
- ежедневные резервные копии PostgreSQL + MinIO с шифрованием;
- мониторинг: uptime + журнал Winston (ротация 10 МБ × 5 файлов);
- rate limiting уже включен (express-rate-limit + Redis);
- health check: GET /health для балансировщика.

## 6. Регуляторные шаги (обязательны перед боевым запуском)

1. Подать уведомление об обработке ПДн в Роскомнадзор (152-ФЗ, ст. 22).
2. Присвоить ИСПДн уровень защищенности (Приказ № 996) и выполнить
   требования Приказа ФСТЭК № 21 (для УЗ-1 — аттестация).
3. Опубликовать оферту (docs/OFFER.md) и политику
   конфиденциальности (docs/PRIVACY_POLICY.md) по публичному адресу.
4. Заключить договоры с клиниками (поручение обработки ПДн).
5. При подключении реальных платежей — эквайринг с онлайн-кассой (54-ФЗ).

## 7. Отключение тестового баланса

Платежи сейчас работают на тестовом балансе
(TEST_BALANCE_ENABLED=true). Для подключения реальных платежей
замените реализацию paymentService на gateway-адаптер и добавьте
webhook-обработчик (маршрут /api/webhooks уже подготовлен).

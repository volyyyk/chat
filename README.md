# MedChat — репозиторий телемедицинской платформы

Репозиторий содержит две версии проекта:

| Папка | Что это | Статус |
|---|---|---|
| `medchat/` | MedChat v1 — первая версия (legacy) | Заморожена, не развивается |
| `medchat-v2/` | MedChat v2 — актуальная версия | Активная разработка |

---

## 📊 Шкала реализации MedChat v2

**Общая готовность: ~78 %**

| Направление | Готовность | Что сделано | Что осталось |
|---|---|---|---|
| Сервер (API, чаты, платежи, приёмы, рецепты) | 85 % | REST + Socket.IO, платные сообщения с тестовым балансом, сплит 80/20, файлы в MinIO, RBAC, ownership-проверки | Прод-режим (реальные шлюзы отключены по требованию), подписи вебхуков |
| Безопасность | 80 % | bcrypt-12, JWT HS256 с пиннингом, refresh-ротация, Joi stripUnknown, rate-limit, MIME-фильтр, security-аудит с фиксами (эскалация ролей, пиннинг цен, IDOR) + 4 набора security-тестов | Валидация JWT_SECRET при старте, вырезка privateKey из req.user, captcha на public endpoints |
| Мобильный клиент (Expo) | 80 % | Все роли, чат server-first с socket+REST, голосовые, файлы, приёмы, рецепты, платежи | UI-полировка, локализация, виртуализация длинных чатов |
| Web-клиент | 70 % | Страницы клиники/админа, запуск через лаунчер на :3002 | Доп. экраны, полировка |
| Тесты | 75 % | unit + integration + security (без БД), e2e smoke по всем ролям, seed-аккаунты | Расширить покрытие (файлы, приёмы) |
| CI/CD | 60 % | GitHub Actions: jest + e2e smoke с Postgres/Redis | Стабилизировать до зелёного, артефакты, деплой |
| Инфраструктура | 80 % | docker-compose (pg/redis/minio), лаунчер «по кнопке» | nginx/TLS, бэкапы по расписанию |
| Документация | 85 % | API, ARCHITECTURE, DEPLOYMENT, GETTING_STARTED, SECURITY_AUDIT, LEGAL, readme_for_AI | Обновлять при изменениях |

## 🚀 Быстрый старт

```bash
# Запуск «по кнопке» (клиника / врач / пациент / всё сразу):
cd medchat-v2/launcher
node launch.js          # меню: 1-clinic, 2-doctor, 3-patient, 4-all

# Или вручную:
cd medchat-v2/server
cp .env.example .env    # при наличии
npm install
npm run seed:test       # тестовые данные
npm run dev             # сервер на :3000
```

Тестовые аккаунты (пароль у всех `Test1234!`):
- `admin@medchat.test` — clinic_admin
- `doctor@medchat.test` — врач
- `patient1@medchat.test` (баланс 200 ₽), `patient2@medchat.test` (баланс 1000 ₽) — пациенты

Тесты:
```bash
cd medchat-v2/server
npm test                # unit + integration + security (БД мокается)
npm run test:smoke     # e2e по всем ролям (нужны Postgres/Redis)
```

## 🔒 Безопасность

Проведён security-аудит с попытками взлома: саморегистрация администраторов запрещена,
цены фиксируются только сервером, JWT с пиннингом алгоритма, чужие транзакции/чаты
недоступны (IDOR-тесты). Реальные платёжные шлюзы отключены (только тестовый баланс).
Подробности: `medchat-v2/docs/SECURITY_AUDIT.md`.

## 🤖 Для ИИ-агентов и новых разработчиков

Полная карта проекта — структура, контракты API, socket-протокол, платёжная логика,
**все заплатки и честные компромиссы** — в [`medchat-v2/docs/readme_for_AI.md`](medchat-v2/docs/readme_for_AI.md).

Запуск по кнопке и как удалить папку launcher, ничего не сломав — [`medchat-v2/launcher/README.md`](medchat-v2/launcher/README.md).

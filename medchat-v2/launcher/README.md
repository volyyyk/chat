# MedChat v2 — Launcher (запуск сторон «по кнопке»)

Эта папка — **автономный инструмент для локального запуска** проекта.
Она не нужна приложению: ни один файл `server/`, `web/`, `mobile/` не ссылается на неё.
Папку можно удалить в любой момент — как это сделать безопасно, см. ниже.

## Что умеет

Запускает выбранную сторону проекта одной командой или одной «кнопкой» в меню:

| Сторона | Команда | Что поднимается | Аккаунт |
|---|---|---|---|
| Клиника | `node launch.js clinic` | docker-инфраструктура + сервер + web-клиент (`http://localhost:3002`) | `admin@medchat.test` / `Test1234!` |
| Врач | `node launch.js doctor` | docker-инфраструктура + сервер + web-клиент (`http://localhost:3002`) | `doctor@medchat.test` / `Test1234!` |
| Пациент | `node launch.js patient` | docker-инфраструктура + сервер + Expo (QR в терминале) | `patient1@medchat.test` / `Test1234!` |
| Всё сразу | `node launch.js all` | всё перечисленное | все аккаунты |

Без аргумента — интерактивное меню:

```bash
cd medchat-v2/launcher
node launch.js
```

Launcher сам:
1. поднимает `postgres`, `redis`, `minio` через `docker compose up -d` (только инфраструктуру, контейнер `server` из docker-compose не используется);
2. если сервер ещё не работает — ставит его зависимости (при первом запуске), прогоняет `npm run seed:test` (идемпотентно) и стартует сервер на `http://localhost:3000`;
3. для клиники/врача — запускает web-клиент на `http://localhost:3002` и открывает браузер;
4. для пациента — запускает `expo start` в `mobile/` (QR-код появится в терминале; открой его в Expo Go, телефон и компьютер должны быть в одной Wi-Fi сети);
5. печатает логины/пароли тестовых аккаунтов выбранной роли.

Если сервер или web-клиент уже запущены — launcher не запускает их повторно.

## Остановка

```bash
node stop.js            # остановить сервер / web / Expo, запущенные launcher'ом
node stop.js --docker   # то же + остановить контейнеры postgres/redis/minio
```

В окне, где работает `launch.js`, тоже можно нажать Ctrl+C — он погасит свои процессы.

## Требования

- **Node.js >= 18** и npm;
- **Docker Desktop** (или собственные PostgreSQL 14+, Redis 7+, MinIO, запущенные на стандартных портах);
- для мобильного клиента — приложение **Expo Go** на телефоне (Android/iOS).

## Как удалить эту папку, чтобы ничего не сломалось

Папка `launcher/` самодостаточна и **не влияет на работу приложения**:

1. Останови запущенное (если было): `node stop.js` (или `node stop.js --docker`, если хочешь погасить и контейнеры).
2. Удали папку:
   ```bash
   # из корня репозитория
   rm -rf medchat-v2/launcher          # Linux / macOS / Git Bash
   Remove-Item -Recurse -Force medchat-v2\launcher   # Windows PowerShell
   ```
3. Больше ничего делать не нужно:
   - код `server/`, `web/`, `mobile/` не импортирует и не вызывает launcher;
   - `package.json` проекта и CI (`.github/workflows/ci.yml`) про launcher не знают;
   - launcher пишет только внутри собственной папки (`launcher/.run/`), наружу — ничего;
   - докер-тома с базой и сам docker compose принадлежат `docker/`, а не launcher.

Запуск проекта без launcher описан в `medchat-v2/docs/GETTING_STARTED.md` (шаги с `docker compose up -d`, `npm run seed:test`, `npm run dev`, `expo start`) — он продолжает работать в точности как раньше.

## Как запустить (памятка в самой папке)

```bash
cd medchat-v2/launcher
node launch.js            # меню
node launch.js doctor     # врач сразу
node stop.js              # стоп
```

Временные файлы launcher (PID-файл и логи процессов) лежат в `launcher/.run/` и удаляются вместе с папкой. Если процессы были запущены, а папку удалили без `stop.js` — просто закрой соответствующие окна или погаси процессы вручную (`node`/`npm start` в `server`, `web`, `mobile`).

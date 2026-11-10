# MedChat Test Server (APK)

Отдельное Android-приложение с лёгкой эмуляцией MedChat API. Предназначено
для проверки клиентов (мобильное RN-приложение, web, десктоп) прямо с
телефона: сервер поднимается на устройстве, клиент в той же Wi-Fi сети
ходит в него по HTTP.

Это НЕ боевой сервер: без PostgreSQL, без Rust-ядра, без реальной
E2E-криптографии и платежей.

## Сборка

- CI: джоба `server-mock-apk` в `.github/workflows/ci.yml` собирает
  debug-APK и выкладывает его артефактом `medchat-server-mock-apk`.
- Локально: Android Studio → открыть папку `medchat-v2/server-mock-android`
  → Run. Или `gradle assembleDebug` (Gradle 8.9, AGP 8.5.2, Kotlin 2.0.21).

## Использование

1. Установить APK на телефон, открыть «MedChat Test Server».
2. Нажать «Запустить» (порт по умолчанию 8080).
3. На экране появится адрес вида `http://192.168.x.x:8080`.
4. В клиенте (экран подключения к серверу) указать этот адрес.
5. Вход: любые email и пароль.

## Что эмулируется

- `GET /health` — статус.
- `POST /api/auth/login`, `/api/auth/register`, `/api/auth/refresh` —
  любые данные, фиктивные токены.
- `GET /api/auth/me` — тестовый пациент.
- `GET /api/chats` — 2 демо-чата: один в окне бесплатных сообщений
  (создан 2 часа назад), второй старше 24 часов.
- `GET/POST /api/chats/{id}/messages` — история и отправка (эхо).
- `GET /api/chats/{id}/check-free` — флаг бесплатного окна
  (`new_chat_window` / `window_expired`), как `NEW_CHAT_FREE_HOURS` на сервере.
- `GET /api/chats/{id}/pricing` — pricing с `newChatFreeHours: 24`.
- `GET /api/chats/{id}/keys`, `POST /api/keys` — пустые заглушки.
- Неизвестные GET → `{success:true,data:[]}`, POST → эхо.

## Ограничения

- Данные живут в памяти и сбрасываются при перезапуске.
- E2E-шифрование не работает: ключи-заглушки, сообщения в открытом виде.
- Оплата, файлы, OAuth, уведомления не эмулируются.

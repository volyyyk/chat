# README_IOS — сборка MedChat для iOS (этап 3 ROADMAP_NATIVE)

> Каркас SwiftUI-источников для Xcode-проекта оператора. CI (джоба ios-smoke)
> гейтит бесекретную часть: runtime-smoke Swift-обвязки ядра, typecheck
> исходников клиента и кросс-компиляцию MedchatCore.xcframework (артефакт
> Actions medchat-core-xcframework).

## Состав каркаса (medchat-v2/ios/)

- MedChatApp.swift — корень: connect → login → main (зеркало desktop-клиента);
- AuthViews.swift — экраны адреса сервера (GET /health) и входа
  (POST /api/auth/login);
- ChatListView.swift / ChatView.swift — список чатов и переписка
  (GET /api/chats?limit=50, GET /api/chats/:id/messages?limit=50,
  POST /api/chats/:id/messages; 402 → тариф исчерпан);
  ChatView: тумблер Double Ratchet per-chat, payload {"t":"r1",...} внутри
  E2E-конверта, honest-fallback на обычный E2E;
- ApiService.swift — REST + Bearer accessToken. refreshToken сознательно
  НЕ хранится: при протухании access пользователь входит заново; 401 от
  любой точки сбрасывает сессию;
- KeychainStore.swift — kSecClassGenericPassword,
  AfterFirstUnlockThisDeviceOnly. Сервисы: medchat.app (токен, сервер, email),
  medchat.e2e (пары ключей), medchat.ratchet (блобы Double Ratchet) —
  зеркало secure_store desktop-клиента;
- CryptoService.swift — E2E-конверты x25519-box через ядро (wire-формат
  байт-в-байт совместим с мобильным клиентом; POST /api/keys
  { keyId, publicKey, algorithm, deviceName: ios }). E2E включается только
  при полном покрытии участников ключами, иначе plaintext-fallback —
  «чат никогда не ломается»;
- RatchetService.swift — Double Ratchet, склейка с отправкой (этап 7):
  сессия на каждый ключ собеседника ratchet.<chatId>.<remoteKeyId> в
  Keychain (save/restore), ss = x25519Dh от identity-ключей UserKey,
  роль по keyId (лексикографически меньший — инициатор);
- MedchatCoreSmoke.swift — runtime-smoke ДЛЯ CI (в приложение НЕ добавлять).

## Сборка в Xcode (оператор)

1. Забрать из Actions артефакты: medchat-core-xcframework (библиотека
   device+sim) и medchat-core-uniffi-bindings (сгенерированный
   MedchatCore.swift + MedchatCoreFFI.h).
2. Создать проект iOS App (SwiftUI, iOS 16+). В target:
   - добавить ios/*.swift из репозитория, КРОМЕ MedchatCoreSmoke.swift;
   - добавить MedchatCore.swift (сгенерированную обвязку) прямо в target —
     так же их компилирует джоба ios-smoke: один модуль с исходниками
     клиента, без import MedchatCore;
   - подключить MedchatCore.xcframework (Frameworks; staticlib внутри);
   - создать bridging header (SWIFT_OBJC_BRIDGING_HEADER) со строкой
     #import "MedchatCoreFFI.h" — C-символы FFI должны быть видны Swift.
3. Info.plist: для тестов против локального сервера разрешить
   NSAppTransportSecurity → NSAllowsLocalNetworking (http://localhost:3000).
4. Запустить сервер: npm run seed:test, затем npm start (порт 3000).
   Тест-аккаунты: patient1@medchat.test / Test1234! (также doctor@,
   admin@, patient2@medchat.test).

## Честные ограничения

- Xcode-проекта в репо нет: .xcodeproj тянет UUID-ы и локальные пути,
  а его сборка требует Apple Developer-аккаунта. CI компилирует исходники
  (typecheck) и ядро (xcframework) — всё, что не требует секретов.
- Подписи, TestFlight, APNs, push — аккаунт и секреты оператора
  (тот же принцип, что Authenticode в desktop: DESKTOP_RELEASE.md).
- Double Ratchet: склеен с отправкой (этап 7: тумблер в ChatView, сессия
  ratchet.<chatId>.<remoteKeyId> в Keychain, payload {"t":"r1",...} внутри
  E2E-конверта, honest-fallback на обычный E2E — чат не ломается);
  файлы/голосовые с гибридной схемой mc:2 мобильного клиента не перенесены.

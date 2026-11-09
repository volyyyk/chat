# MedChat v2.0.0 — релизные заметки (9 ноября 2026)

MedChat v2 — телемедицинская платформа «клиника — врачи — пациенты»: чаты
пациент ↔ врач, E2E-шифрование содержимого сообщений/файлов/голосовых
(X25519 + NaCl box), Double Ratchet в нативных клиентах, платные сообщения
с дележом дохода 80/20, записи на приём, электронные рецепты, файлы (MinIO).

## Что в этом релизе

- **Rust-ядро libmedchat_core**: AES-256-GCM, bcrypt-verify, конверты NaCl box,
  Double Ratchet (X3DH-lite, skip-store, wire-формат), SHA-256/gzip hotpath,
  Raw X25519-DH. Биндинги: napi-rs (Node) + UniFFI (Swift/Kotlin).
  Контракт-векторы байт-в-байт (NaCl box, AES-256-GCM BoringSSL KAT, bcrypt,
  RFC 7748), бенчмарк ≥ x10, fuzz-цели (smoke в CI), cargo-audit.
- **E2E-шифрование во всех клиентах**: конверты x25519-box байт-в-байт между
  мобильным (RN), desktop (Rust-ядро), iOS/Android нативными и web-клиентом;
  honest plaintext-fallback при неполном покрытии ключами; ratchet — в нативных
  клиентах, RN/web — честные плашки. Верификация safety number в мобильном.
- **Desktop (Tauri 2)**: рабочий клиент Windows/Linux, ядро path-депом без FFI,
  secure storage (keyring), per-chat тумблер ratchet, ленивая расшифровка.
- **iOS (SwiftUI) / Android (Jetpack Compose) нативные клиенты**: экраны
  connect/login/chats/chat, ApiService, Keychain/Keystore, CryptoService,
  RatchetService (X3DH-lite, роль по keyId, персистентность).
- **Web-клиент (React, врачи/клиника)**: E2E x25519-box (tweetnacl), конверты
  байт-в-байт с остальными клиентами, превью с 🔒, honest-fallback.
- **CI: 15 джоб** (server, e2e-smoke, web-build, core, bench, napi, fuzz,
  uniffi, ios-smoke, android-smoke, android-build, desktop-check,
  desktop-bundle, k6-load, core-audit).

## Честные ограничения (секреты оператора не подключены)

- **Android**: MedChat-Android-debug-unsigned.apk — неподписанный debug-APK.
  Установка: adb install. Release-подпись и Play Console — оператор
  (medchat-v2/android/README_ANDROID.md).
- **iOS**: MedChat-iOS-MedchatCore-xcframework.zip — Rust-ядро + Swift-обвязка
  (UniFFI) для сборки .ipa/TestFlight оператором (medchat-v2/ios/README_IOS.md).
  Устанавливаемого .ipa в релизе НЕТ: подпись Apple требует секретов оператора.
- **Desktop**: Linux .deb + .AppImage, Windows MedChat-Windows-Setup-unsigned.exe
  — установщики Tauri 2 без подписей Authenticode/GPG и автоапдейта
  (medchat-v2/docs/DESKTOP_RELEASE.md).
- **Web**: MedChat-Web-static.zip — статический бандл; разворачивается оператором
  за nginx/TLS, адрес API — REACT_APP_API_URL при сборке.
- **Сервер**: Node 18+ / Express / PostgreSQL / Redis / MinIO — docker-compose;
  реальные платёжные шлюзы отсутствуют (тестовый баланс) — осознанное
  требование владельца; SMS-гейт/Госуслуги для 149-ФЗ — оператор.

Ассеты релиза собраны из артефактов последнего зелёного прогона CI на main;
SHA256SUMS.txt — контрольные суммы. Документация: medchat-v2/docs/
(readme_for_AI.md — полная карта для ИИ-агентов, ROADMAP_NATIVE.md — статус
этапов, E2E_PROTOCOL.md, DESKTOP_RELEASE.md, LEGAL.md).
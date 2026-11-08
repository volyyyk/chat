# README_ANDROID — Android-клиент (MedChat v2, этап 4 ROADMAP_NATIVE)

> Этап 4 ч.3: Gradle-проект + Compose UI. Сервисы каркаса живут в
> app/src/main/java/medchat/android и typecheck'аются в CI (джоба
> android-smoke, kotlinc против android.jar, без androidx); джоба
> android-build собирает unsigned debug-APK (assembleDebug) из
> артефактов CI (uniffi-обвязка + .so). Release-подпись и Play Console
> — оператор (паттерн честности DESKTOP_RELEASE.md: гейтится всё, что
> не требует секретов оператора).

## Что здесь

- settings.gradle.kts / build.gradle.kts / gradle.properties — Gradle
  8.9, AGP 8.5.2, Kotlin 2.0.21 (Compose-компилятор плагином Kotlin),
  Compose BOM 2024.09.03, JNA 5.14.0 aar, minSdk 23 (Keystore API),
  compile/target 34. Gradle wrapper НЕ коммитится: CI ставит Gradle
  setup-градл-экшеном, локально — gradle wrapper (см. ниже).
- app/src/main/java/medchat/android/ApiService.kt — REST-клиент
  (HttpURLConnection + org.json): /health, /api/auth/login,
  /api/auth/me, /api/chats, /api/chats/:id/messages, /api/chats/:id/keys,
  POST /api/keys. Токен — в SecureStore; refreshToken сознательно не
  хранится: 401 сбрасывает сессию (onUnauthorized → экран входа).
- .../SecureStore.kt — секреты в Android Keystore (AES-256-GCM под
  мастер-ключом AndroidKeyStore; medchat.app / medchat.e2e /
  medchat.ratchet).
- .../CryptoService.kt — E2E-конверты x25519-box через medchat-core
  (import uniffi.medchat_core): keyId android-*, приватный ключ только
  в Keystore, wire байт-в-байт совместим с мобильным клиентом на
  tweetnacl (контракт-вектор 1ce9516).
- .../RatchetService.kt — Double Ratchet: save/restore MedRatchetState
  через Keystore, encrypt/decrypt wire; склейка с путём отправки —
  остаток этапа 7 (UI-клиент пока ходит E2E-конвертами).
- .../MainActivity.kt + MedchatApp.kt — Compose UI (зеркало desktop
  ui/index.html): connect → login → chats → chat; ключ E2E
  регистрируется при входе (POST /api/keys); отправка — конверт при
  полном покрытии ключами участников (content пуст), honest-fallback
  на plaintext; входящие расшифровываются лениво; ratchet-payload —
  честная плашка (как в RN); токен/сервер/email — SecureStore.
- MedchatCoreSmoke.kt — runtime-smoke обвязки (джоба android-smoke,
  JVM через JNA против host-cdylib).
- ApiService.kt / SecureStore.kt / CryptoService.kt / RatchetService.kt
  в корне medchat-v2/android/ — стабы-перенаправления (файлы переехали
  в app/src/main/java/medchat/android/).

## Как CI проверяет (джобы android-smoke и android-build)

- android-smoke: обвязка + MedchatCoreSmoke.kt исполняются в JVM через
  JNA против host-cdylib; сервисы компилируются kotlinc против
  android.jar (androidx не участвует; пакет обвязки гейтится явно —
  uniffi.medchat_core); кросс-компиляция .so (cargo-ndk, NDK r27c,
  arm64-v8a / armeabi-v7a / x86_64, api 21) — артефакт
  medchat-core-android.
- android-build (needs uniffi-bindings + android-smoke): артефакты
  раскладываются в src/main/java/uniffi и src/main/jniLibs, Gradle 8.9
  собирает :app:assembleDebug — артефакт medchat-android-debug-apk
  (unsigned; ставится через adb install).

## Локальная сборка (секреты не нужны)

1. Собрать ядро и обвязку (docs/INTEGRATION_BINDINGS.md §3.1):
   cargo build --release --no-default-features --features uniffi-bind,serde
   (host) + cargo-ndk для трёх ABI; uniffi-bindgen v0.28.3
   --language kotlin (та же версия, что крейт).
2. Раскладка: uniffi-out/kotlin/uniffi → app/src/main/java/uniffi;
   .so → app/src/main/jniLibs/<abi>/libmedchat_core.so.
3. gradle :app:assembleDebug (Gradle 8.9+, JDK 17; локально удобно
   сгенерировать wrapper: gradle wrapper → ./gradlew assembleDebug).
4. Тест: сервер npm run seed:test + npm start; эмулятор видит хост как
   10.0.2.2 (адрес http://10.0.2.2:3000); тест-аккаунты
   patient1@medchat.test / Test1234! (seed:test).

## Честные ограничения

- Double Ratchet не склеян с UI-путём отправки — остаток этапа 7
  (RatchetService готов; сообщения идут E2E-конвертами, ratchet-
  payload от desktop/iOS показывается честной плашкой).
- minSdk 23: .so собирается с api 21, но SecureStore (KeyGenParameterSpec,
  AES-GCM в AndroidKeyStore) требует API 23+.
- allowBackup=false: секреты не должны уходить в облачный бэкап.
- Биометрическая привязка ключа (setUserAuthenticationRequired) не
  настроена — решение оператора после полевых испытаний.
- JNA тянет рантайм; прямой JNI-порт обвязки — при необходимости,
  замена прозрачна для сервисов.
- Подписи, Play Console, internal testing — оператор (секреты).

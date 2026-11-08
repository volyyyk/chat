# README_ANDROID — каркас Android-клиента (MedChat v2, этап 4 ROADMAP_NATIVE)

> Каркас источников БЕЗ Gradle-проекта: он компилируется в CI (джоба
> android-smoke, шаг typecheck) вместе со сгенерированной UniFFI-обвязкой
> против android.jar. Сборку Gradle-проекта, подписание и публикацию
> в Play Console выполняет оператор (паттерн честности DESKTOP_RELEASE.md:
> гейтится всё, что не требует секретов оператора).

## Что здесь

- ApiService.kt — REST-клиент сервера (HttpURLConnection + org.json,
  без androidx): /health, /api/auth/login, /api/auth/me, /api/chats,
  /api/chats/:id/messages, /api/chats/:id/keys, POST /api/keys. Токен
  живёт в памяти; refreshToken сознательно не хранится: 401 сбрасывает
  сессию (onUnauthorized → экран входа).
- SecureStore.kt — секреты в Android Keystore (зеркало KeychainStore на
  iOS и secure_store на desktop): мастер-ключ AES-256-GCM генерируется и
  живёт только в AndroidKeyStore, значения хранятся шифротекстом.
  Сервисы: medchat.app / medchat.e2e / medchat.ratchet.
- CryptoService.kt — E2E-конверты x25519-box через ядро medchat-core:
  keyId вида android-*, приватный ключ не покидает устройство (только
  SecureStore), wire байт-в-байт совместим с мобильным клиентом на
  tweetnacl (контракт-вектор 1ce9516).
- RatchetService.kt — Double Ratchet: save/restore MedRatchetState через
  Keystore, encrypt/decrypt wire-формата; склейка с путём отправки —
  этап 7 (пока сообщения идут E2E-конвертами).
- MedchatCoreSmoke.kt — runtime-smoke обвязки (отдельный шаг CI, JVM
  через JNA против host-cdylib, 32 проверки).

## Как CI проверяет каркас (джоба android-smoke)

Сгенерированная обвязка (uniffi-bindgen v0.28.3) + четыре файла каркаса
компилируются kotlinc против android.jar (org.json + Keystore API; если
платформа не стоит у раннера — sdkmanager доустанавливает platforms;
android-34) и JNA. androidx/Compose не участвуют: UI-слой будет в
Gradle-проекте оператора (ч.3 этапа 4).

## Сборка Gradle-проекта (оператор)

1. Android Studio: новый проект (Kotlin, minSdk 23 — см. ниже),
   источники medchat-v2/android/ — в main source set.
2. .so ядра из артефакта medchat-core-android (три ABI) — в
   src/main/jniLibs/<abi>/libmedchat_core.so (собирает джоба android-smoke,
   шаг cargo-ndk).
3. UniFFI-обвязка (артефакт medchat-core-uniffi-bindings, каталог kotlin)
   — в source set рядом с каркасом (один пакет, без import).
4. JNA для Android: зависимость net.java.dev.jna:jna (aar) — обвязка
   зовёт ядро через неё (механика — docs/INTEGRATION_BINDINGS.md).
5. SecureStore.configure(applicationContext) в Application.onCreate().
6. UI (Compose) и smoke-сценарии Espresso — ч.3 этапа 4.

## Честные ограничения

- Gradle-проекта и Compose-UI нет: каркас — сервисы + typecheck в CI.
- minSdk: .so собирается с api 21, но SecureStore (KeyGenParameterSpec,
  AES-GCM в AndroidKeyStore) требует API 23+ — minSdk Gradle-проекта 23.
- Биометрическая привязка ключа (setUserAuthenticationRequired) не
  настроена — решение оператора после UI-слоя.
- JNA тянет рантайм; прямой JNI-порт обвязки (uniffi-kotlin без JNA) —
  при необходимости, замена прозрачная для каркаса.
- Подписи, Play Console, internal testing — оператор (секреты оператора).

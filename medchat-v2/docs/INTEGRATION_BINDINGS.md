# INTEGRATION_BINDINGS — как подключить medchat-core к платформе

> Практический гайд по биндингам крипто-ядра (этапы 3/4 ROADMAP_NATIVE —
> нативные iOS/Android, этап 6 — серверный napi-плагин). Один крипто-контракт —
> три поверхности: Node.js (napi-rs, src/node.rs), Swift и Kotlin (UniFFI,
> src/uniffi_iface.rs). API ниже сверено с кодом на HEAD (3eaf319);
> артефакты обвязки публикует CI (см. §4).

## 1. Контракт (одинаков для всех платформ)

- Конверт x25519-box: generate_keypair / seal_for_recipients / open_sealed;
  ключи 32 байта, nonce 24 байта (XSalsa20, как NaCl box) — бинарно совместим
  с tweetnacl мобильного клиента (контракт-вектор 1ce9516).
- Double Ratchet: сессия одной стороны диалога; wire-формат сообщения
  header (40) || nonce (12) || ciphertext (+16 байт GCM tag); skip-store
  расшифровывает внеочередные, replay отклоняется (OutOfOrder).
- Персистентность сессии: save()/restore() (feature serde) — bincode-буфер
  состояния. Буфер содержит СЕКРЕТЫ (root key, цепочки, приватный
  ratchet-ключ): только secure storage платформы (Keychain / Keystore /
  Credential Manager / libsecret), никогда — UserDefaults, shared_prefs,
  логи, сервер.
- Ошибки: Aead / NoBoxForRecipient / NotInitialized / OutOfOrder / BadHeader /
  BadHash; неверная длина аргумента — InvalidArgument (napi: InvalidArg)
  на границе обёртки, до криптографии.

## 2. Node.js (napi-rs) — сервер и desktop-инструменты

Джоба CI napi-build: cargo build --release --no-default-features
--features napi-bind,serde → rename cdylib в medchat-core.linux-x64-gnu.node,
затем node napi-smoke.js (JS-зеркало юнит-тестов node.rs) — это
референсный smoke-путь: повторяйте его проверки при интеграции.

Подключение: require('./medchat-core.linux-x64-gnu.node').

- Конверты: core.generateKeypair() → { publicKey, secretKey } (Buffer
  32+32); core.sealForRecipients(plaintext, [pubA, pubB]) →
  { epk, nonce, boxes }; core.openSealed(epk, nonce, boxes, myPublic,
  mySecret) → Buffer. JSON-конверт для API { v: 1, alg: "x25519-box",
  epk, nonce, boxes } собирает JS (base64 — на JS-стороне).
- Double Ratchet:
    const a = core.JsRatchetState.initInitiator(sharedSecret, bobRatchetPub);
    const b = core.JsRatchetState.initResponder(sharedSecret, bobRatchetPub, bobRatchetSecret);
    const m = a.encrypt(plaintext);           // → { header, nonce, ciphertext }
    const pt = b.decrypt(m.header, m.nonce, m.ciphertext);
    const wire = core.ratchetMessageToWire(m.header, m.nonce, m.ciphertext);
    b.decryptWire(wire);                       // from_wire + decrypt
- Персистентность (serde включена в .node):
    const blob = b.save();                     // bincode-буфер, Buffer
    const b2 = core.JsRatchetState.restore(blob);
    // диалог продолжается; replay уже расшифрованного — ошибка
Хранение blob на сервере/инструментах — только защищённое (файл 0600
или секрет-менеджер); в продукте персистентность — у клиента.

## 3. UniFFI (Swift/Kotlin) — нативные клиенты

Джоба CI uniffi-bindings: cargo build --release --no-default-features
--features uniffi-bind,serde → uniffi-bindgen v0.28.3 (git-тег mozilla/uniffi-rs,
library mode; crates.io-индекса у uniffi нет) генерирует обвязку из cdylib:
uniffi-out/kotlin/*.kt и uniffi-out/swift/*.swift + MedchatCoreFFI.h +
modulemap. Компиляция сгенерированного кода в Xcode/Gradle на ubuntu
недоступна — она выполняется на целевой машине разработчика (DoD этапов 3/4).

### 3.1 Сборка нативной библиотеки

    cd medchat-v2/core
    cargo build --release --no-default-features --features uniffi-bind,serde --target <target>

- iOS: aarch64-apple-ios (+ aarch64-apple-ios-sim) → libmedchat_core.a,
  собирается в xcframework. С ноября 2026 это собирает джоба CI ios-smoke (macos-latest): cargo rustc --crate-type staticlib на оба таргета (dylib в App Store запрещены, Cargo.toml ядра не трогается) → xcodebuild -create-xcframework, артефакт medchat-core-xcframework (Swift-заголовки внутри).
- Android: cargo-ndk (aarch64-linux-android, armv7-linux-androideabi, ...)
  → libmedchat_core.so → jniLibs/<ABI>/.
- ВАЖНО: та же версия uniffi-bindgen (0.28.3) и те же features, что в CI —
  формат metadata привязан к версии крейта и CLI.

### 3.2 Kotlin (Jetpack Compose, этап 4)

- Зависимость JNA (обвязка 0.28 ходит через JNA):
  implementation("net.java.dev.jna:jna:5.x@aar") — точную версию сверить
  с Gradle-проектом при склейке (честно: не фиксируем вслепую).
- Сгенерированный MedchatCore.kt из артефакта CI + библиотека в jniLibs:
  JNA загружает libmedchat_core.so по имени.
- API: MedRatchetState.initInitiator(sharedSecret, remoteRatchetPublic),
  initResponder(...), encrypt/decrypt/decryptWire (иммутабельны,
  Mutex внутри), save() → ByteArray, restore(saved) → MedRatchetState;
  конверты sealForRecipients/openSealed, MedKeyPair/MedSealedMessage;
  bcryptVerify (проверка пароля против серверного хэша).
- Персистентность: blob от save() — в Android Keystore /
  EncryptedSharedPreferences; restore(blob) при открытии чата.

### 3.3 Swift (SwiftUI, этап 3)

- Сгенерированные MedchatCore.swift + MedchatCoreFFI.h + MedchatCore.modulemap
  из артефакта CI; xcframework из libmedchat_core.a (устройство + симулятор);
  модуль подключается через modulemap (без bridging header): import MedchatCore.
- С ноября 2026 обвязка гейтится рантаймом: джоба CI ios-smoke (macos-latest)
  генерирует Swift-обвязку (тот же bindgen v0.28.3), компилирует её swiftc
  вместе с ios/MedchatCoreSmoke.swift (runtime-зеркало napi-smoke.js:
  конверт roundtrip, бокс отправителя, битые длины, Double Ratchet
  in-order/wire/skip-store/replay, save/restore, bcrypt KAT) против
  host-сборки cdylib и запускает бинарник.
- API: MedRatchetState.initInitiator/initResponder, encrypt/decrypt/
  decryptWire, save() → Data, restore(saved:) → MedRatchetState; конверты
  SealedMessage/KeyPair-обёртки; bcryptVerify.
- Персистентность: blob от save() — в Keychain (kSecClassGenericPassword,
  accessibility AfterFirstUnlockThisDeviceOnly); restore при старте чата.
- Каркас SwiftUI-клиента: medchat-v2/ios/*.swift (этап 3 ч.2) — экраны,
  ApiService (REST + Bearer), KeychainStore (сервисы medchat.app /
  medchat.e2e / medchat.ratchet), CryptoService (generateKeypair /
  sealForRecipients / openSealed; wire байт-в-байт с мобильным клиентом),
  RatchetService (save/restore MedRatchetState в Keychain). Исходники
  компилируются ВМЕСТЕ со сгенерированной обвязкой (один модуль, без
  import MedchatCore): typecheck в джобе ios-smoke; сборка в Xcode
  (обвязка в target + bridging header) — README_IOS.md.

### 3.4 Чек-лист склейки (этапы 3/4)

1) сборка нативной библиотеки под target-ы платформы;
2) обвязка из артефакта CI (или локально тем же bindgen 0.28.3);
3) провязка загрузки библиотеки (JNA / xcframework);
4) smoke-путь-зеркало napi-smoke.js: конверт roundtrip + ratchet roundtrip
   + save/restore + replay-отказ;
5) персистентность: save/restore только в secure storage;
6) обновление ядра = пересборка библиотеки и обвязки одной версией.

## 4. CI-артефакты

- medchat-core-linux-x64-gnu (.node) — джоба napi-build;
- medchat-core-uniffi-bindings (uniffi-out/) — джоба uniffi-bindings;
- medchat-core-xcframework (device aarch64-apple-ios + simulator, со Swift-заголовками) — джоба ios-smoke (этап 3);
- ci-logs/*.log — логи падений (метка «=== run <id> job <name>» для сверки
  со свежестью). Артефакты в репо не коммитятся — забирать из Actions.

## 5. Что дальше (честно)

- Этап 3 (iOS): с ноября 2026 Swift-обвязка компилируется и исполняется в CI
  (джоба ios-smoke: runtime-smoke на macOS-раннере против host-cdylib,
  кросс-компиляция device/sim, xcframework-артефакт). Компиляция
  SwiftUI-приложения в Xcode, TestFlight и подписи требуют Xcode-проекта
  и аккаунта оператора (Apple Developer, APNs-ключи); DoD этапа 3
  (TestFlight-билд со smoke-сценариями) закрывается на стороне оператора.
- Этап 4 (Android): компиляция Kotlin-обвязки в Gradle НЕ выполнялась —
  этот гайд описывает механику; DoD этапа требует internal-testing
  в Play Console (аккаунт оператора).
- Этап 7: склейка ratchet с клиентским UI — одна реализация ядра,
  у клиентов только transport + storage (см. §1 про секреты буфера).
# ROADMAP: нативные платформы и системные языки (MedChat → MedChat Native)

> Стратегический документ. Отвечает на три вопроса:
> 1) Куда идём: нативные iOS/Android, Windows (exe), Linux (Ubuntu), серверные горячие пути.
> 2) Какие блоки переписываем на Rust / C / C# / Java — и по каким критериям.
> 3) Как идём: этапы с Definition of Done, чтобы каждый шаг не ломал работающий продукт.

Принципы:
- **Не переписывать работающее ради переписывания.** Node-сервер и Expo-клиент —
  ядро поставки; системные языки подключаются там, где дают измеримый выигрыш
  (безопасность, производительность, требования платформ/магазинов, законы).
- **Одно ядро — много оболочек.** Вся бизнес-логика и криптография переезжают
  в общий core; UI-оболочки тонкие.
- **Каждый этап независимо поставляем и покрыт тестами** (contract-тесты между
  оболочками и ядром, идентичные тест-векторы).

## 1. Карта «блок → текущая реализация → целевой язык → почему»

| Блок | Было | Цель | Статус (ноябрь 2026) | Обоснование |
|---|---|---|---|---|
| Криптография at-rest (cryptoService) | Node (AES-GCM через crypto) | **Rust**: `libmedchat_core` + napi-rs | **Сделано, где горячо**: SHA-256-чексуммы и gzip-сжатие бэкапов — Rust (hotpath.rs + napi, серверные обёртки с честным fallback на node:crypto/zlib); at-rest AES-GCM остаётся в Node — AES-256-GCM ядра байт-в-байт совместим (KAT e7879a7), переезд не даёт выгоды при текущей нагрузке | Memory safety, единая реализация на сервере и всех клиентах, готовность к аудиту |
| E2E X25519-box | tweetnacl (мобильный клиент) | остаётся в клиентах | **Сделано во всех клиентах**: мобильный, desktop (Rust-ядро), iOS/Android (UniFFI), web (tweetnacl, конверты байт-в-байт); контракт — readme_for_AI §5 | Рабочий E2E-контур: сервер хранит только шифротекст |
| Double Ratchet (forward secrecy) | прототип в medchat-core | **Rust** в ядре + napi-rs/UniFFI биндинги | **Сделано и склеено**: desktop/iOS/Android (X3DH-lite, роль по keyId, save/restore в системном secure storage, honest-fallback); RN/web — честная плашка; негативные тесты + fuzz | Максимально критичный блок: одна реализация, fuzzing (cargo-fuzz), формальная верифицируемость |
| Хэширование чексимм файлов, сжатие бэкапов | Node streams | **Rust** (napi-rs) | **Сделано** (hotpath.rs: SHA-256 KAT FIPS 180-4, gzip RFC 1952; utils/checksum.js + utils/compress.js, fallback честно отражён) | CPU-bound, разгружает event-loop сервера |
| Realtime gateway (fan-out тысяч соединений) | Node Socket.IO | Этап A: Node + Redis pub/sub; Этап B: **Rust** (tokio) при >10k соединений | **По плану** (этап A работает; B — по фактической нагрузке) | Node справляется до тысяч; переписывать раньше времени — риск без выгоды |
| Поиск по сообщениям | Postgres ILIKE + GIN pg_trgm | **Rust** (Tantivy) при полнотексте | **Дешёвая часть сделана** (pg_trgm + GIN, seed: messages_content_trgm_idx); Tantivy — по нагрузке; E2E-контент серверу не виден (шифротекст) — честное ограничение | Дешёвая оптимизация раньше тяжёлой |
| iOS-клиент | Expo (JS) | **Swift + SwiftUI** + Rust-ядро (UniFFI) | **Сделано (каркас)**: экраны, ApiService, KeychainStore, CryptoService, RatchetService; джоба ios-smoke (runtime-smoke + typecheck + xcframework); сборка .ipa/TestFlight/APNs — оператор | Требования App Store, производительность, Keychain, нативные push |
| Android-клиент | Expo (JS) | **Kotlin + Jetpack Compose** + Rust-ядро (JNI) | **Сделано (каркас + APK)**: Gradle-проект, Compose-экраны, Keystore, RatchetService; джоба android-build собирает unsigned debug-APK; release-подпись/Play Console/FCM — оператор | Play Store, Android Keystore, фоновая доставка |
| Windows-клиент (exe) | — | **Tauri 2** (Rust), общий UI с Linux | **Сделано (каркас)**: рабочий клиент, ядро path-депом, secure storage (keyring 3); джоба desktop-bundle собирает NSIS .exe; Authenticode/автоапдейт — оператор | ~10–15 МБ вместо Electron-сотен, system webview |
| Linux Ubuntu-клиент | — | **Tauri 2** → `.deb` + AppImage | **Сделано (каркас)**: та же кодовая база; .deb + AppImage собираются в CI (desktop-bundle); подписи/GPG-репозиторий — оператор | Та же кодовая база, что и Windows |
| Web-клиент (браузер, клиника/врач) | React, без E2E (недоделан) | React + tweetnacl (браузерный E2E) | **Доделано**: E2E x25519-box конверты байт-в-байт с остальными клиентами, honest plaintext-fallback; приватный ключ в localStorage (в браузере нет secure storage — компромисс по прецеденту LEGAL.md §2); ratchet/mc:2 — честные плашки; джоба web-build, релизный ассет MedChat-Web-static.zip | Врач/клиника на любом ПК без установки desktop-приложения |
| Серверный API | Node/Express | остаётся Node; горячие пути → napi-rs | **По плану** (чексуммы/сжатие — napi; остальной сервер не тронут, CI зелёный) | Стабильность, экосистема Sequelize |
| ГОСТ-криптография (если УЗ-1 сертификация) | — | **C/C++**: сертифицированные СКЗИ | **Оператор** (аттестация ФСТЭК, LEGAL.md) | Только готовые сертифицированные библиотеки |
| Интеграции с WinAPI/офисом клиники | — | **C#/.NET 8** — точечно | **Не требуется** (deep-Windows-фич нет) | Если появится MSIX, 1С-мосты |
| Интеграции на JVM (гос-сервисы, корпоративные) | — | **Java/Kotlin (JVM)** — точечно | **Не требуется** | Только если интеграционный контур партнёра JVM |

Итог по языкам: **Rust — основной системный язык проекта** (ядро, клиенты, desktop,
горячие пути). **C/C++ — только готовые сертифицированные СКЗИ.** **C# и Java —
точечные интеграции**, когда их требует внешняя среда, а не внутренняя архитектура.

## 2. Этапы (каждый — отдельная веха с DoD)

### Этап 1. Общее ядро логики (без смены языков)
Выделить из мобильного клиента и сервера общую часть (модели сообщений/чатов,
клиентский кэш, работа с S3-файлами, retry/дедупликация) в переиспользуемый
пакет с контрактными тестами.
**DoD:** contract-тесты гоняются против API-сервера в CI; мобильный клиент
использует ядро без изменения UX.

**Прогресс (ноябрь 2026):** DoD «contract-тесты гоняются против API-сервера в CI» —
сделано: джоба e2e-smoke (seed, все стороны через REST/Socket.IO, платежи, поиск,
E2E-секции [12]/[13]) — контрактные API-сценарии против настоящего сервера с
реальной Postgres. DoD «мобильный клиент использует общее ядро» — замещён:
RN-клиент заморожен как reference (анти-цель §5), общая логика переехала в
Rust-ядро (этап 2) и нативные клиенты (этапы 3/4); выделять JS-пакет общей
логики под замороженный RN-клиент выгоды не даёт. Этап 1 закрыт как
замещённый (контрактная часть DoD выполнена).

### Этап 2. Rust-ядро `libmedchat_core`
Криптография (AES-256-GCM, Argon2/bcrypt-verify), кодек протокола, checksums.
Биндинги: **napi-rs** (Node), **UniFFI** (Swift/Kotlin).
**DoD:** тест-векторы совпадают с текущей Node-реализацией байт-в-байт;
cargo-fuzz без падений 24 ч; бенчмарк ≥ x10 к Node на крипто-пути.
**Прогресс (ноябрь 2026):** пункт DoD «тест-векторы байт-в-байт» закрыт для
примитива NaCl box (1ce9516): канонический вектор из дистрибутива NaCl
(public domain) проверяется сразу в двух реализациях на общей фикстуре
core/tests/nacl_box_vector.hex — Rust-ядро (SalsaBox, crypto_box 0.9,
core/tests/interop_vectors.rs, джоба CI core-tests) и tweetnacl, библиотека
мобильного клиента (server/tests/coreInterop.test.js, джоба server-tests).
Вектор AES-256-GCM закрыт тем же паттерном (e7879a7): три KAT-вектора из
BoringSSL (public domain) на общей фикстуре core/tests/aes_gcm_vector.hex —
Rust (aes-gcm 0.10, core/tests/aes_gcm_vector.rs) и Node crypto
(server/tests/coreAesGcm.test.js) воспроизводят ct||tag байт-в-байт.
Вектор bcrypt закрыт тем же паттерном (8776f7c): 4 KAT-вектора из тестов
OpenBSD/crypt_blowfish (Solar Designer, public domain) на общей фикстуре
core/tests/bcrypt_vector.txt — Rust (крейт bcrypt, bcrypt_verify в lib.rs,
core/tests/bcrypt_vector.rs) и нативный bcrypt сервера
(server/tests/bcryptInterop.test.js; в authService пароли хэшируются с
cost 12) верифицируют все векторы одинаково. 8-битные векторы ($2x$,
баг 2a) осознанно исключены — реализации на них расходятся.
napi-rs-биндинги для Node реализованы (754f677 → 2bb38f2 → e411a54:
src/node.rs — конвертные примитивы + класс JsRatchetState для Double Ratchet;
состояние не сериализуется — персистентность на вызывающей стороне; биндинги
вынесены за feature napi-bind: cargo test линкует исполняемый тестовый
бинарник, а napi_*-символы в рантайме даёт только процесс Node
(napi-rs issue #1099, libnode.so не поставляется), поэтому CI гоняет
cargo check --tests (компиляция биндингов и их тестов) +
cargo test --no-default-features (тесты логики); .node-артефакт через napi-cli).
MSRV поднят до 1.77 (30c3f5e: napi-build 2.6 эмитит инструкции билд-скрипта
синтаксисом cargo::, старый rust-version 1.65 заставлял cargo отвергать
билд-скрипт).
Бенчмарки criterion добавлены (d2db23e): benches/crypto.rs — конверты
x25519-box (seal+open на 1/3 получателя, seal), Double Ratchet (encrypt+
decrypt и полный wire-цикл to_wire/from_wire), bcrypt_verify (cost 5 KAT +
production cost 12); criterion 0.5 — dev-зависимость, target [[bench]]
harness=false, в обычные прогоны ядра не входит. Зеркальная Node-сторона и
джоба CI (f79de00): server/bench/coreBench.js (tweetnacl-box мобильного
клиента, Node crypto AES-256-GCM, нативный bcrypt; тот же payload и cost,
sanity-проверки roundtrip/KAT), core-bench гоняет cargo bench
--no-default-features и Node-референс на одном раннере, лог публикуется
в ci-logs/ci-bench.log всегда — числа для сверки DoD «≥ x10» читаются из
лога (тайминги не гейтятся автоматикой: машины шатательны).
Первый прогон core-bench (run 42474787549, лог ci-logs/ci-bench.log) — DoD
«≥ x10» закрыт по эталонному конвертному x25519-box-пути (JS tweetnacl —
библиотека мобильного клиента): Rust быстрее в 11.6–15.2 раза (seal+open
1 получ.: 116.8 µs против 1.53 мс; 3 получ.: 218.4 µs против 2.53 мс;
seal: 66.5 µs против 1.01 мс). Double Ratchet encrypt+decrypt: 1.92 µs — в
Node реализации нет, сравнивать не с чем. bcrypt — обе стороны нативные,
Rust-крейт чуть медленнее (cost 5: 1.86 против 1.64 мс; cost 12: 233 против
206 мс) — честно зафиксировано, DoD на bcrypt-путь не заявлялся.
Сборка .node-артефакта в CI настроена (джоба napi-build): cargo build
--release (cdylib) → rename в medchat-core.linux-x64-gnu.node, артефакт
через upload-artifact; там же Node-интеграция обёрток — napi-smoke.js
(JS-зеркало #[cfg(test)]-тестов node.rs: конверты, ratchet/wire,
skip-store, негативные кейсы) в настоящем Node-процессе, чего cargo
test дать не может (issue #1099).
cargo-fuzz scaffold готов: крейт fuzz/ с тремя целями (open_sealed на
враждебных конвертах, from_wire+decrypt на мусорном wire, roundtrip
произвольного plaintext) + джоба CI fuzz-smoke (nightly, ASan, -runs=5000).
DoD «cargo-fuzz без падений 24 ч» — суточный прогон отдельным запуском по
требованию, не в CI (smoke в CI гейтит сборку целей и отсутствие крашей на
коротком прогоне). UniFFI-биндинги Swift/Kotlin реализованы (feature uniffi-bind: src/uniffi_iface.rs
— обёртки конвертов x25519-box, bcrypt_verify, MedRatchetState (Mutex:
uniffi-методы Object иммутабельны), ratchet_message to_wire/from_wire,
константы; MedCryptoError повторяет CoreError + InvalidArgument для длин).
Джоба CI uniffi-bindings: сборка cdylib с metadata-scaffolding, uniffi-bindgen
0.28.3 (library mode) генерирует Kotlin- и Swift-обвязку (артефакт CI), cargo
test обёрток (в отличие от napi, uniffi-код линкуется в тестовый бинарник
чисто). Крейт и CLI берутся из git-тега v0.28.3 mozilla/uniffi-rs: семейство
uniffi-крейтов отсутствует в sparse-индексе crates.io (прогоны #105–#107 —
«could not find uniffi-bindgen in registry crates-io»), git-источник
фиксирует версию и не требует индексных записей (внутренние зависимости —
path-депы workspace). Прогон #108: в workspace тега v0.28.3 пакета uniffi-bindgen нет — CLI-пакет называется uniffi-bindgen-cli (member examples/app/uniffi-bindgen-cli, publish=false, бинарь uniffi-bindgen); cargo install выбирает пакет по имени, поэтому установка идёт как uniffi-bindgen-cli. Прогон #109 (run 42479915852):
сборка cdylib упала с 8 ошибками E0277 — uniffi::Error (0.28) требует
std::fmt::Display у ошибок экспортов; добавлен ручной impl Display для
MedCryptoError. Склейка сгенерированной обвязки с Xcode/Gradle-проектами — этапы 3/4.
Этап 2 закрыт по всем заявленным позициям: контракт-векторы (NaCl box,
AES-256-GCM, bcrypt), бенчмарк ≥ x10 (11.6–15.2x на конвертном пути),
cargo-fuzz scaffold + smoke в CI, биндинги napi-rs (Node) и UniFFI
(Swift/Kotlin); суточный fuzz-прогон — отдельный запуск по требованию.
Далее: этапы 3/4 (нативные клиенты поверх ядра), этап 5 (каркас desktop начат,
см. ниже), интеграция Double Ratchet в клиенты (этап 7).

### Этап 3. Нативный iOS (Swift/SwiftUI)
SwiftUI-клиент поверх ядра: чаты, голосовые (AVAudio), рецепты, приёмы;
ключи в **Keychain**, TLS-pinning, APNs-пуши.
Механика подключения биндингов (UniFFI-обвязка, xcframework, save/restore
в Keychain) — docs/INTEGRATION_BINDINGS.md.
**DoD:** TestFlight-билд проходит smoke-сценарии (те же 50 проверок, адаптированные
под UI-автотесты XCUITest).

**Прогресс (ноябрь 2026, ч.1 — инструментальная цепочка):** джоба CI ios-smoke
(macos-latest, первые macOS-раннеры в CI) гейтит бесекретную часть
iOS-сборки: кросс-компиляция ядра под aarch64-apple-ios и
aarch64-apple-ios-sim (staticlib — dylib в App Store запрещены), сборка
MedchatCore.xcframework (артефакт Actions для Xcode-проекта) и
runtime-smoke сгенерированной Swift-обвязки на host-cdylib
(medchat-v2/ios/MedchatCoreSmoke.swift — зеркало napi-smoke.js: конверт
roundtrip, бокс отправителя, битые длины, Double Ratchet
in-order/wire/skip-store/replay, save/restore, bcrypt KAT). Компиляция
SwiftUI-клиента, TestFlight и APNs требуют Xcode-проекта и аккаунта
оператора (Apple Developer, сертификаты подписи — аналог Authenticode
в desktop, DESKTOP_RELEASE.md): гейтится всё, что секретов не требует.
Следующий шаг — каркас SwiftUI-источников + Keychain-слой.
Фикс после первого прогона (#136): swiftc разрешает top-level-код
только в файле main.swift — CI копирует smoke-файл под этим именем
перед компиляцией (имена UniFFI-API при этом были верными).

**Прогресс (ноябрь 2026, ч.2 — каркас SwiftUI-клиента):** medchat-v2/ios/ —
экраны connect/login/main (зеркало desktop ui/index.html), ApiService (REST +
Bearer; refresh не хранится, 401 сбрасывает сессию), KeychainStore
(kSecClassGenericPassword, AfterFirstUnlockThisDeviceOnly; сервисы
medchat.app / medchat.e2e / medchat.ratchet), CryptoService (конверты
x25519-box через ядро, wire байт-в-байт с мобильным клиентом; POST /api/keys,
keyId вида ios-*; E2E при полном покрытии участников, иначе
plaintext-fallback), RatchetService (save/restore MedRatchetState в Keychain;
склейка с UI-путём — этап 7), README_IOS.md (сборка Xcode-проекта: обвязка в
target + bridging header, честные ограничения). Джоба ios-smoke дополнена
шагом typecheck: исходники клиента компилируются вместе со сгенерированной
обвязкой (один модуль, без import MedchatCore) — компиляция каркаса гейтится
в CI до появления Xcode-проекта (сборка .ipa, TestFlight, подписи, APNs —
оператор).

### Этап 4. Нативный Android (Kotlin/Compose)
Jetpack Compose-клиент поверх того же ядра: ключи в **Android Keystore**,
FCM-пуши, фоновая доставка сообщений.
Механика подключения биндингов (JNA, jniLibs, save/restore в Keystore) —
docs/INTEGRATION_BINDINGS.md.
**DoD:** internal testing в Play Console, smoke-сценарии в Espresso.

**Прогресс (ноябрь 2026, ч.1 — инструментальная цепочка Android):** джоба CI
android-smoke (ubuntu, зеркало ios-smoke): uniffi-bindgen v0.28.3 генерирует
Kotlin-обвязку, kotlinc 2.0.21 + JNA 5.14.0 компилируют её вместе с
medchat-v2/android/MedchatCoreSmoke.kt (зеркало napi-smoke.js: конверт
roundtrip, бокс отправителя, битые длины, Double Ratchet
in-order/wire/skip-store/replay, save/restore, bcrypt KAT) и исполняют
в JVM против host-cdylib; кросс-компиляция NDK r27c через cargo-ndk
(arm64-v8a / armeabi-v7a / x86_64, api 21) — артефакт
medchat-core-android (.so для jniLibs). Gradle-сборка приложения,
Play Console и подписи — на машине оператора (секреты оператора,
паттерн честности DESKTOP_RELEASE.md): гейтится всё, что секретов
не требует.
    Первый прогон (run 42515929507) выявил молчаливые смерти шагов
    (bash -e: падение присваивания под $() гасит шаг без следов в
    tee-логе); телеметрия шагов добавлена: exec > >(tee -a …) в начале
    каждого шага, || true на присваиваниях PKG/HEADER, curl -fsSL.
    Прогон 42518440522: телеметрия сработала — Swift smoke и typecheck
    зелёные; оба падения точечные: bindgen кладёт Kotlin-обвязку
    в подкаталог uniffi/ (поиск сделан рекурсивным), cargo rustc
    --crate-type staticlib оставляет .a в deps/ (find + cp в
    release-корень).
    Прогон 42519176935: ios-smoke ЗЕЛЁНЫЙ (Swift smoke + typecheck +
    кросс-компиляция staticlib + xcframework — фикс deps/.a сработал);
    android упал на баге uniffi-bindgen 0.28.3: поле ошибки message в
    Kotlin-обвязке конфликтует с Throwable.message (kotlinc:
    conflicting declarations) — поле переименовано в detail (Swift не
    задет, у NSError нет message).
    Прогон 42519636579: конфликт поля исчез, но вскрылось правило
    gen_kotlin (convert_error_suffix): ошибки с суффиксом Error
    генерируются как Exception — класс в Kotlin-обвязке называется
    MedCryptoException (Swift имя не меняет), smoke-файл поправлен
    синхронно.
    Прогон 42520064455: компиляция kotlinc зелёная, JNA-рантайм упал
    на kotlin-stdlib вне класспаса (NoClassDefFoundError Function0) —
    stdlib добавлена в -cp java (find в /opt/kotlinc с диагностикой).
    Прогон 42520309135: kotlin-smoke ЗЕЛЁНЫЙ целиком (все 32 проверки —
    stdlib-фикс сработал); кросс-компиляция упала на смене синтаксиса
    cargo-ndk 4.x: платформа — это --platform (заглавная -P; в 3.x была
    строчная -p), строчная -p уезжает в cargo-аргументы и трактуется
    как --package 21 → паника unknown package: 21. Флаг заменён на
    --platform 21, ANDROID_NDK_ROOT выровнен с зафиксированной NDK r27c
    (иначе warning о несовпадении с предустановленной NDK раннера).

**Прогресс (ноябрь 2026, ч.2 — каркас Kotlin-источников):** medchat-v2/android/ —
ApiService (REST поверх HttpURLConnection + org.json: те же контракты §5,
Bearer, 401 сбрасывает сессию, refresh не хранится), SecureStore (Android
Keystore: мастер-ключ AES-256-GCM только в AndroidKeyStore, значения —
шифротекст под ним; зеркало KeychainStore), CryptoService (E2E x25519-box
через обвязку; keyId android-*, пара — только через SecureStore),
RatchetService (save/restore MedRatchetState через Keystore, wire
encrypt/decrypt), README_ANDROID.md (сборка Gradle-проекта у оператора).
Джоба android-smoke дополнена шагом typecheck: источники компилируются
kotlinc вместе с обвязкой против android.jar (org.json + Keystore API;
sdkmanager-фолбэк platforms;android-34) и JNA — без androidx/Compose.
Gradle-проект, Compose UI (ч.3), Play Console и подписи — оператор
(секреты оператора, паттерн честности DESKTOP_RELEASE.md); wire .so —
api 21, но Keystore (KeyGenParameterSpec) требует API 23+ — minSdk
Gradle-проекта 23, честно зафиксировано в README_ANDROID.md.

**Прогресс (ноябрь 2026, ч.3 — Gradle-проект + Compose UI):** медchat-v2/android/ —
полноценный Gradle-проект (Gradle 8.9, AGP 8.5.2, Kotlin 2.0.21 + плагин
compose, Compose BOM 2024.09.03, JNA 5.14.0 aar, minSdk 23): сервисы
переехали в app/src/main/java/medchat/android (package medchat.android,
import uniffi.medchat_core; typecheck в android-smoke остался по новым
путям, пакет обвязки гейтится явно), Compose-экраны connect/login/chats/
chat (MedchatApp.kt — зеркало desktop-клиента; ключ E2E регистрируется
при входе, отправка конвертом при полном покрытии ключами, honest-fallback);
новая джоба CI android-build (needs uniffi-bindings + android-smoke)
раскладывает артефакты прогона (uniffi-обвязка → src/main/java/uniffi,
.so 3 ABI → src/main/jniLibs) и собирает :app:assembleDebug — артефакт
medchat-android-debug-apk (unsigned debug-APK без секретов оператора;
adb install / эмулятор 10.0.2.2). Release-подпись, internal testing и
Play Console — оператор (секреты, DESKTOP_RELEASE.md-паттерн).
### Этап 5. Desktop: Windows (exe) + Ubuntu
**Tauri 2** (Rust + системный webview): один UI на обе платформы.
Windows: подписанный `.exe`/MSIX (Authenticode), автoupdate.
Ubuntu: `.deb` + AppImage, systemd-автостарт по желанию.
Секреты: **Windows Credential Manager** / **libsecret (GNOME Keyring)**.
**DoD:** установщики собираются в CI (matrix: windows-latest, ubuntu-latest);
обновление конфигурации сервера без правки клиента.

**Прогресс (ноябрь 2026):** каркас готов (medchat-v2/desktop): Tauri 2 +
системный webview (wry), рабочий клиент ui/index.html (подключение к серверу по адресу с проверкой /health, логин, список чатов, чтение и отправка сообщений REST; панель диагностики ядра; E2E-конверты шифруются и расшифровываются на устройстве — этап 7); ядро medchat-core
подключено напрямую path-депом (Rust → Rust, без FFI — desktop единственный
клиент без биндингов), tauri-команды core_probe (конверт x25519-box) и
ratchet_probe (Double Ratchet через wire) гоняют крипто-путь ядра из
приложения; джоба CI desktop-check (apt libwebkit2gtk-4.1-dev + cargo check
--all-targets) гейтит компиляцию каркаса и интеграцию. Иконка приложения (каркас):
PNG генерируется в build.rs (32x32 RGBA, CRC32/Adler32 на месте — канал
коммита текстовый, бинарные ассеты в репо не попадают) и подключена явным
bundle.icon: ["icons/icon.png"]: generate_context! требует существующий png
даже при bundle.active=false, а пустой список иконок дефолтный фолбэк tauri
не отменяет (прогоны #113–#116). Сборка установщиков
запущена (джоба CI desktop-bundle: matrix ubuntu-latest → .deb + AppImage,
windows-latest → NSIS .exe; tauri CLI из npm, артефакты Actions; иконки
бандлера генерирует build.rs: 32x32/128x128/128x128@2x PNG + icon.ico BMP —
плейсхолдер-тил, настоящие иконки лягут бинарным каналом). Подписи
(Authenticode) и автоапдейт — следующие шаги этапа; что именно требуется
от оператора (сертификаты, GPG, endpoint автоапдейта, минимальный чек-лист
релиза) — docs/DESKTOP_RELEASE.md. Секреты Credential
Manager/libsecret реализованы в каркасе: secure_store (крейт keyring 3:
windows-native / sync-secret-service + crypto-rust), tauri-команды
ratchet_save/ratchet_load/ratchet_delete + smoke-probe полного цикла
персистентности (save → restore → продолжение диалога); blob состояния
Double Ratchet — ТОЛЬКО системное хранилище.

### Этап 6. Сервер: горячие пути
napi-rs-плагин для крипто/checksum/сжатия; при росте — вынос websocket-gateway
на Rust (tokio) за общим Redis pub/sub (прозрачно для клиентов — тот же протокол).
**Прогресс (ноябрь 2026):** начат — SHA-256 checksum перенесён в medchat-core
(модуль src/hotpath.rs на sha2 — зависимости не растут: HMAC-SHA256 уже в
дереве Double Ratchet; KAT FIPS 180-4 «abc»/пустая строка в юнит-тестах),
napi-обёртки sha256Checksum/sha256Verify (src/node.rs) едут в том же
.node-артефакте napi-build; parity с node:crypto сверяет napi-smoke.js.
Серверная интеграция сделана: server/src/utils/checksum.js — нативный
.node-аддон (MEDCHAT_CORE_NODE, иначе артефакт napi-build рядом с core) с
честным fallback на node:crypto (backend = native|fallback); jest-тест
checksum.test.js — KAT FIPS 180-4 + parity, нативный путь в CI гейтит
napi-build (napi-smoke), server-tests гоняют fallback. ~~Сжатие бэкапов~~ — сделано (flate2 в hotpath.rs: gzip RFC 1952, Err
вместо паники; napi backupCompress/backupDecompress; серверная обёртка
utils/compress.js с fallback на node:zlib; backupService сжимает ДО
шифрования, restore разжимает ПОСЛЕ, флаг metadata.compressed для
старых бэкапов; тесты compress.test.js + сжатый кейс backupIntegrity).
~~k6-нагрузочный (DoD)~~ — сделано (сценарий server/load/k6-smoke.js:
/health (лёгкий путь, вне rate limit) + /api/auth/login (тяжёлый:
bcrypt cost 12 + JWT), ramping 2→10 VUs ~60 с, гейт http_req_failed<1%
и p95<2500 мс; джоба CI k6-load поднимает Postgres + Redis + seed,
сервер на раннере в фоне, лог ci-logs/ci-k6.log публикуется всегда —
деградация p95 читается из репозитория от прогона к прогону;
RATE_LIMIT_AUTH_MAX/RATE_LIMIT_WINDOW_MS повышены только в env
CI-стенда, прод-дефолты rateLimiter.js не тронуты; «x10 текущей»
калибруется оператором на реальном стенде — CI гейтит профиль).
Этап 6 закрыт по всем позициям DoD. Бизнес-точка подключена: чексуммы целостности
бэкапов (createBackup фиксирует metadata.checksum SHA-256 шифротекста,
restoreBackup и verifyBackupPassword сверяют до расшифровки, битый файл
→ 422 INTEGRITY_ERROR; тест backupIntegrity.test.js на моках моделей без
БД; старые бэкапы без чексуммы пропускают проверку).
**DoD:** нагрузочный тест (k6) x10 текущей нагрузки без деградации p95;
CI остаётся зелёным на каждом шаге.

### Этап 7. E2E-шифрование (Double Ratchet) + юридическая фаза
**Прогресс (ноябрь 2026):** X25519-box E2E работает (d11762c → 596c4a3: реестр
UserKey, конверты, plaintext в БД отсутствует; с 42e5a1d → ed9a661 файлы и
голосовые — внутри E2E-контура: гибридное шифрование, ключ файла в конверте,
расшифровка при просмотре). Прототип Double Ratchet в
medchat-core (src/ratchet.rs, 6aff983 → d033eeb: KDF_RK/KDF_CK на HMAC-SHA256,
AES-256-GCM на одноразовых message keys, 13 тестов + 3 сериализационных (feature serde), wire-формат
to_wire/from_wire — a43102d). Skip-store реализован (d033eeb):
внеочередные сообщения расшифровываются через буфер одноразовых message keys
(MAX_SKIP=2000/MAX_SKIPPED_KEYS=500, превышение → OutOfOrder), replay отклоняется.
Ограничения честно: в клиенты не интегрирован — wire-формат заголовков готов
(a43102d: header 40 || nonce 12 || ciphertext); napi-биндинги JsRatchetState
для Node готовы (2bb38f2, src/node.rs, feature napi-bind), UniFFI для
Swift/Kotlin и интеграция в клиенты — далее. Сериализация состояния
(feature serde, bincode-совместимая; JSON не подходит — ключи skip-store
нестроковые) — персистентность сессий между запусками готова (3 теста:
roundtrip диалога после восстановления, skip-store переживает сериализацию,
blob содержит секреты — только secure storage); биндинги save/restore
сделаны (napi: JsRatchetState.save()/restore(), src/node.rs; UniFFI:
MedRatchetState.save()/restore(), src/uniffi_iface.rs; feature serde,
bincode-буфер; проверки: napi-smoke.js и юнит-тест uniffi — диалог
продолжается после restore, replay отклоняется); следующий шаг —
склейка с клиентами. Склейка с desktop-клиентом сделана (этап 7):
tauri-команды main.rs e2e_get_or_create_key (пара X25519, приватный
ключ — только secure storage, сервис medchat.e2e) / e2e_seal /
e2e_open (wire-формат байт-в-байт совместим с мобильным клиентом на
tweetnacl: base64, UTF-8 plaintext, decode прощает паддинг и без),
UI после логина регистрирует публичный ключ POST /api/keys, при
открытии чата читает GET /api/chats/:id/keys, отправляет конверт
{v:1, alg, epk, nonce, boxes} — бокс на каждого участника (бокс
отправителя обязателен, сервер проверяет), входящие metadata.e2e
расшифровывает на устройстве; при неполном покрытии участников
ключами — честный plaintext-fallback (чат не ломается); склейка E2E-конвертов с клиентами завершена (desktop UI после логина,
iOS ChatView + CryptoService, RN-мобилка, web-клиент (services/e2eCrypto.js + ChatPage: конверты байт-в-байт, приватный ключ в localStorage — честный компромисс браузера без secure storage, ratchet — плашка); Android — каркас CryptoService,
UI ч.3); следующая фаза этапа 7 — ratchet-сессии в клиентском пути:
raw X25519-DH экспортирован из ядра во все три поверхности (x25519_dh
lib / x25519Dh napi + UniFFI; клампинг RFC 7748) — shared secret из
identity-ключей реестра UserKey для init_initiator/init_responder,
KAT-вектор §6.1 сверяют Rust-тесты и все smoke-зеркала.
Склейка ratchet-сессий в desktop-клиенте сделана (ratchet_encrypt/
ratchet_decrypt в main.rs: сессия — с устройством собеседника, ss =
x25519_dh(identity-ключи реестра, X3DH-lite без prekeys), начальная
роль детерминирована сравнением keyId (меньший — инициатор) — обе
стороны сходятся к ролям без рукопожатия; ленивая инициализация —
отправка создаёт сессию инициатора, первый входящий — отвечающего;
состояние — bincode в secure storage medchat.ratchet, аккаунт
ratchet.<chatId>.<remoteKeyId>; UI: per-chat тумблер, plaintext конверта —
payload {"t":"r1","k":keyId,"w":wire}, honest-fallback на обычный E2E
при любой ошибке — чат не ломается). iOS-склейка сделана (фаза 3: RatchetService.ensureSession — ss = x25519Dh от identity-ключей UserKey, роль по keyId, аккаунт ratchet.<chatId>.<remoteKeyId> в Keychain; ChatView — тумблер, payload {"t":"r1","k":keyId,"w":wire}, honest-fallback). RN — честная плашка сделана (ChatScreen.isRatchetPayload: бейдж вместо JSON-мусора; RN ratchet-сессию не держит). Compose UI (ч.3) сделан: Gradle-проект + джоба CI android-build (unsigned debug-APK); Android ratchet-склейка сделана (RatchetService.ensureSession: per-remote сессии, ss = x25519Dh identity-ключей, роль по keyId; MedchatApp: тумблер per-chat + ленивая расшифровка входящих, honest-fallback) — этап 7 закрыт: desktop, iOS, Android; RN — честная плашка reference-клиента.
Реализация в Rust-ядре: X25519 + Double Ratchet, серверный key-registry.
Верификация fingerprint-кодов: РЕАЛИЗОВАНА в мобильном клиенте
(347bc9d + ec1a0de: safety number — 60 цифр из SHA-512 по набору ключей чата,
сверка участниками через иконку verified-user в шапке чата). После этого — при необходимости — ГОСТ СКЗИ
(сертифицированные C++-библиотеки) для аттестации ФСТЭК УЗ-1.
**DoD:** спецификация + внешний аудит + негативные тесты (компрометация устройства
не ломает прошлые сообщения — forward secrecy).

**Прогресс по DoD (ноябрь 2026):** спецификация — сделана (docs/E2E_PROTOCOL.md:
модель угроз и честные ограничения, реестр ключей UserKey + конверты x25519-box,
Double Ratchet — KDF байт-в-байт, wire-формат, X3DH-lite-инициализация, skip-store
и лимиты, персистентность, интеграционный контракт клиентов с honest-fallback);
негативные тесты — сделаны (ratchet.rs: forward secrecy/replay/tamper/DoS-лимиты,
зеркала napi-smoke.js + Swift/Kotlin-smoke; fuzz-цели — smoke в CI, суточный прогон
по требованию); внешний аудит и ГОСТ СКЗИ — операторские позиции (УЗ-1, LEGAL.md).

## 3. Порядок работ и приоритеты

1 → 2 идут последовательно (ядро без смены языка, затем Rust).
3/4 (нативные клиенты) — после 2, можно параллельно.
5 (desktop) — после 2, независимо от 3/4.
6 (сервер) — по мере нагрузки; не раньше 2.
7 (E2E) — после 2 и стабилизации 3/4; юридически требуется идентификация
пользователей по 149-ФЗ ст. 10.1 (см. LEGAL.md) до промышленной эксплуатации.
Серверная основа сделана (ноябрь 2026): эндпоинты phone/request-code и
phone/verify — одноразовый 6-значный код в VerificationToken (тип phone,
срок 10 минут), успех ставит user.phoneVerified=true; реальный SMS-гейт
или Госуслуги подключает оператор перед продом (см. LEGAL.md §5).

Статус (ноябрь 2026): этапы 2–7 закрыты в части, не требующей секретов
оператора — контракт-векторы (NaCl box, AES-256-GCM, bcrypt, RFC 7748),
бенчмарк ≥ x10 на конвертном пути, fuzz-smoke, napi + UniFFI-биндинги,
CI-гейты всех платформ (server, e2e, core, bench, napi, fuzz, uniffi,
ios-smoke, android-smoke, android-build, desktop-check, desktop-bundle,
k6-load, core-audit, web-build), E2E + Double Ratchet склеены во всех нативных клиентах
(desktop, iOS, Android; web — конверты x25519-box, ratchet — честная плашка;
RN — честная плашка reference-клиента).
Остаток этапов 3/4/5/7 — операторские позиции: TestFlight и подписи
Apple, Play Console и подписи Android, Authenticode/GPG-подписи и
автоапдейт desktop, SMS-гейт для 149-ФЗ, ГОСТ СКЗИ и внешний аудит
для УЗ-1, суточный fuzz-прогон по требованию.
GitHub Releases: workflow Release (.github/workflows/release.yml) публикует
GitHub Release с бинарными ассетами всех платформ (Android unsigned debug-APK,
Linux .deb + AppImage, Windows NSIS exe, Web MedChat-Web-static.zip,
iOS MedchatCore.xcframework.zip — .ipa требует подписи Apple оператора,
uniffi-обвязка + .node-ядро, SHA256SUMS) из артефактов последнего зелёного
прогона CI на main; триггер — пуш ветки release/<tag> (v2.0.0, ноябрь 2026).

## 4. Требования безопасности, общие для всех нативных клиентов

- Секреты только в системных хранилищах (Keychain / Keystore / Credential
  Manager / libsecret), никогда в UserDefaults/shared_prefs/файлах.
- TLS 1.2+ с пиннингом сертификата сервера; свои сертификаты не отключать.
- Отсутствие секретов в репозитории; сборочные подписи в GitHub Secrets.
- Зависимости: `cargo audit` / `cargo deny`, Dependabot; для iOS/Android —
  регулярное обновление платформы под требования магазинов.
- Anti-tamper базово: проверка целостности бинаря не требуется MVP, но
  prohibited: хранение ключей в коде.

**Прогресс (ноябрь 2026):** «cargo audit / cargo deny, Dependabot» — сделано:
джоба CI core-audit (cargo-audit против advisory-базы RUSTSEC; Cargo.lock
в джобе генерируется свежим — лок не в репо, библиотечный крейт; уязвимости
роняют джобу, unmaintained-предупреждения печатаются без фейла) +
.github/dependabot.yml (cargo: ядро; npm: server; github-actions: версии
actions в CI; группы — один PR на экосистему: одиночный PR тянет полный
14-джобовый CI-прогон, первый запуск дал 20 PR и переполнил очередь раннеров;
замороженная RN-мобилка обновляется вручную — reference-клиент). TLS-пиннинг и сборочные подписи — позиции, привязанные
к прод-TLS и сертификатам оператора (пины появляются вместе с прод-сертификатом,
подписи — в GitHub Secrets оператора).

## 5. Что НЕ делаем (анти-цели)

- Не переписываем Node-сервер целиком на Rust/Go «заодно».
- Не пишем свою криптографию на C/C++ (только сертифицированные СКЗИ).
- Не тащим Electron на desktop (Tauri покрывает обе ОС в 10 раз легче).
- Не ведём два UI-фреймворка на одной платформе (Expo-клиент замораживается
  после выхода нативных аналогов, но остаётся как reference).
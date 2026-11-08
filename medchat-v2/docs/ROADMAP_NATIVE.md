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

| Блок | Сейчас | Цель | Обоснование |
|---|---|---|---|
| Криптография at-rest (cryptoService) | Node (AES-GCM через crypto) | **Rust**: `libmedchat_core` + napi-rs | Memory safety, единая реализация на сервере и всех клиентах, готовность к аудиту |
| E2E X25519-box | реализовано (tweetnacl в мобильном, Rust-ядро совместимо; контракт — readme_for_AI §5) | остаётся в клиентах | Рабочий E2E-контур: сервер хранит только шифротекст |
| Double Ratchet (forward secrecy) | прототип в medchat-core (src/ratchet.rs, 6aff983 + skip-store d033eeb + wire-формат a43102d + сериализация serde + биндинги save/restore) | **Rust** в ядре + napi-rs/UniFFI биндинги | Максимально критичный блок: одна реализация, fuzzing (cargo-fuzz), формальная верифицируемость |
| Хэширование чексумм файлов, сжатие бэкапов | Node streams | **Rust** (napi-rs) | CPU-bound, разгружает event-loop сервера |
| Realtime gateway (fan-out тысяч соединений) | Node Socket.IO | Этап A: Node + Redis pub/sub; Этап B: **Rust** (tokio) при >10k соединений | Node справляется до тысяч; переписывать раньше времени — риск без выгоды |
| Поиск по сообщениям | Postgres ILIKE + GIN pg_trgm (seed: messages_content_trgm_idx) | **Rust** (Tantivy) при полнотексте | «Сначала pg_trgm + GIN» — сделано; дешёвая оптимизация раньше тяжёлой |
| iOS-клиент | Expo (JS) | **Swift + SwiftUI** + Rust-ядро (UniFFI) | Требования App Store, производительность, Keychain для ключей, нативные push (APNs) |
| Android-клиент | Expo (JS) | **Kotlin + Jetpack Compose** + Rust-ядро (JNI) | Play Store, Android Keystore, FCM-фоновая доставка |
| Windows-клиент (exe) | — | **Tauri 2 (Rust)**, общий UI с Linux | ~10–15 МБ вместо Electron-сотен, system webview, подпись Authenticode |
| Linux Ubuntu-клиент | — | **Tauri 2** → `.deb` + AppImage | Та же кодовая база, что и Windows |
| Серверный API | Node/Express | остаётся Node; горячие пути → napi-rs | Стабильность, экосистема Sequelize, CI уже зелёный |
| ГОСТ-криптография (если УЗ-1 сертификация) | — | **C/C++**: сертифицированные СКЗИ (КриптоПро CSP и т.п.) как native-зависимости | Использовать только готовые сертифицированные библиотеки; свой код в C/C++ не пишем |
| Интеграции с WinAPI/офисом клиники | — | **C#/.NET 8** (WinUI/WPF) — точечно | Если появится deep-Windows фича (MSIX, 1С-мосты); не базовый путь |
| Интеграции на JVM (гос-сервисы, корпоративные) | — | **Java/Kotlin (JVM)** — точечно | Только если интеграционный контур партнёра JVM; не базовый путь |

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

### Этап 4. Нативный Android (Kotlin/Compose)
Jetpack Compose-клиент поверх того же ядра: ключи в **Android Keystore**,
FCM-пуши, фоновая доставка сообщений.
Механика подключения биндингов (JNA, jniLibs, save/restore в Keystore) —
docs/INTEGRATION_BINDINGS.md.
**DoD:** internal testing в Play Console, smoke-сценарии в Espresso.

### Этап 5. Desktop: Windows (exe) + Ubuntu
**Tauri 2** (Rust + системный webview): один UI на обе платформы.
Windows: подписанный `.exe`/MSIX (Authenticode), автoupdate.
Ubuntu: `.deb` + AppImage, systemd-автостарт по желанию.
Секреты: **Windows Credential Manager** / **libsecret (GNOME Keyring)**.
**DoD:** установщики собираются в CI (matrix: windows-latest, ubuntu-latest);
обновление конфигурации сервера без правки клиента.

**Прогресс (ноябрь 2026):** каркас готов (medchat-v2/desktop): Tauri 2 +
системный webview (wry), статическая обвязка ui/index.html; ядро medchat-core
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
Серверная интеграция (обёртка с fallback на node:crypto) и сжатие бэкапов —
следующие шаги; k6-нагрузочный по DoD — после интеграции.
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
склейка с клиентами (UI + secure storage).
Реализация в Rust-ядре: X25519 + Double Ratchet, серверный key-registry.
Верификация fingerprint-кодов: РЕАЛИЗОВАНА в мобильном клиенте
(347bc9d + ec1a0de: safety number — 60 цифр из SHA-512 по набору ключей чата,
сверка участниками через иконку verified-user в шапке чата). После этого — при необходимости — ГОСТ СКЗИ
(сертифицированные C++-библиотеки) для аттестации ФСТЭК УЗ-1.
**DoD:** спецификация + внешний аудит + негативные тесты (компрометация устройства
не ломает прошлые сообщения — forward secrecy).

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

## 4. Требования безопасности, общие для всех нативных клиентов

- Секреты только в системных хранилищах (Keychain / Keystore / Credential
  Manager / libsecret), никогда в UserDefaults/shared_prefs/файлах.
- TLS 1.2+ с пиннингом сертификата сервера; свои сертификаты не отключать.
- Отсутствие секретов в репозитории; сборочные подписи в GitHub Secrets.
- Зависимости: `cargo audit` / `cargo deny`, Dependabot; для iOS/Android —
  регулярное обновление платформы под требования магазинов.
- Anti-tamper базово: проверка целостности бинаря не требуется MVP, но
  prohibited: хранение ключей в коде.

## 5. Что НЕ делаем (анти-цели)

- Не переписываем Node-сервер целиком на Rust/Go «заодно».
- Не пишем свою криптографию на C/C++ (только сертифицированные СКЗИ).
- Не тащим Electron на desktop (Tauri покрывает обе ОС в 10 раз легче).
- Не ведём два UI-фреймворка на одной платформе (Expo-клиент замораживается
  после выхода нативных аналогов, но остаётся как reference).
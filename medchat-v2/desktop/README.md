# MedChat Desktop (каркас этапа 5 ROADMAP_NATIVE.md)

Tauri 2: Rust-бэкенд + системный webview (wry). Целевые платформы этапа 5 —
Windows (exe/MSIX, подпись Authenticode) и Ubuntu (.deb/AppImage), общая
кодовая база (ROADMAP_NATIVE.md, этап 5).

## Что уже есть (каркас)

- src-tauri/ — Rust-приложение Tauri 2:
  - крипто-ядро medchat-core подключено напрямую path-депом (Rust → Rust,
    без FFI): desktop — единственный клиент MedChat без биндингов (napi —
    Node, UniFFI — Swift/Kotlin);
  - команды-пробы: core_probe (roundtrip конверта x25519-box) и
    ratchet_probe (Double Ratchet: encrypt → to_wire → from_wire → decrypt
    на согласованной паре generate_keypair — урок прогонов #104/#105/#111).
- ui/index.html — статическая обвязка для системного webview
  (app.withGlobalTauri — window.__TAURI__.core.invoke, без npm-сборки).
- Джоба CI desktop-check: apt libwebkit2gtk-4.1-dev + cargo check
  --all-targets (гейтит валидность tauri.conf.json, резолв дерева tauri
  и типо-совместимость команд с ядром; лог падений — ci-logs/ci-desktop.log).

## Локальный запуск

    cd medchat-v2/desktop/src-tauri
    cargo run

Системные зависимости Linux (webkit2gtk):
sudo apt-get install -y libwebkit2gtk-4.1-dev. Windows/macOS — стандартный
тулчейн Tauri 2 (WebView2/WKWebView поставляются системой).

## Чего НЕТ (честно)

- Установщиков (.deb/AppImage/exe), подписей, автообновления — следующий
  шаг этапа 5 (нужны иконки, bundle-конфиг, matrix CI windows/ubuntu).
- Клиентского UI — текущая обвязка только гоняет команды-пробы.
- TLS-pinning, секреты в Credential Manager/libsecret, интеграция с API
  сервера — по мере роста каркаса в полноценный клиент.

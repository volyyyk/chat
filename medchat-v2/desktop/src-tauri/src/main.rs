// MedChat Desktop — каркас этапа 5 ROADMAP_NATIVE.md (Tauri 2).
//
// UI — системный webview (wry) поверх статической обвязки ../ui
// (app.withGlobalTauri — window.__TAURI__ без npm-сборки фронтенда).
// Крипто-ядро medchat-core подключено напрямую path-депом (Rust -> Rust):
// desktop — единственный клиент MedChat без биндингов (napi — Node,
// UniFFI — Swift/Kotlin).
//
// Команды-пробы гейтят крипто-путь в контексте приложения: core_probe —
// roundtrip конверта x25519-box; ratchet_probe — Double Ratchet с
// wire-циклом; ratchet_storage_probe — полный цикл персистентности
// сессии: encrypt -> save (secure storage) -> restore -> продолжение
// диалога. Secure storage (этап 5): секреты Double Ratchet — ТОЛЬКО
// системные хранилища (Windows Credential Manager / libsecret = GNOME
// Keyring) через крейт keyring 3 (см. Cargo.toml). UI — рабочий клиент (ui/index.html): подключение к серверу
// (адрес + GET /health), логин, чаты, чтение и отправка сообщений — REST;
// пробы ядра — панель «Ядро» в сайдбаре. E2E-конверты (этап 7) — полный
// клиентский путь: пара X25519 устройства в secure storage (сервис
// medchat.e2e), публичный ключ регистрируется на сервере (POST /api/keys),
// шифрование/расшифровка конвертов x25519-box (e2e_seal/e2e_open) —
// байт-в-байт совместимы с мобильным клиентом (tweetnacl).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use medchat_core::{generate_keypair, open_sealed, seal_for_recipients, SealedMessage};

/// Smoke-команда: roundtrip конверта x25519-box через ядро
/// (та же схема, что в юнит-тестах lib.rs).
#[tauri::command]
fn core_probe() -> Result<String, String> {
    let kp = generate_keypair();
    let sealed = seal_for_recipients(b"desktop-probe", &[kp.public_key])
        .map_err(|e| format!("seal: {e}"))?;
    let opened = open_sealed(&sealed, &kp.public_key, &kp.secret_key)
        .map_err(|e| format!("open: {e}"))?;
    if opened == b"desktop-probe".to_vec() {
        Ok(format!("ok: envelope roundtrip, {} box(es)", sealed.boxes.len()))
    } else {
        Err("roundtrip mismatch".into())
    }
}

/// Smoke-команда: Double Ratchet (ядро этапа 7) — encrypt -> to_wire ->
/// from_wire -> decrypt. Пара Боба согласована по построению
/// (generate_keypair): фиктивные константы — баг #104/#105/#111-класса.
#[tauri::command]
fn ratchet_probe() -> Result<String, String> {
    use medchat_core::{RatchetMessage, RatchetState};

    let bob_kp = generate_keypair();
    let mut alice = RatchetState::init_initiator(&[7u8; 32], &bob_kp.public_key);
    let mut bob = RatchetState::init_responder(&[7u8; 32], bob_kp);

    let msg = alice
        .encrypt(b"desktop-ratchet")
        .map_err(|e| format!("encrypt: {e}"))?;
    let wire = msg.to_wire();
    let parsed = RatchetMessage::from_wire(&wire)
        .map_err(|e| format!("from_wire: {e}"))?;
    let plaintext = bob
        .decrypt(&parsed)
        .map_err(|e| format!("decrypt: {e}"))?;
    if plaintext == b"desktop-ratchet".to_vec() {
        Ok(format!("ok: ratchet wire roundtrip, {} bytes", wire.len()))
    } else {
        Err("ratchet roundtrip mismatch".into())
    }
}

// ----- Secure storage (этап 5): Credential Manager / libsecret -----

/// Обёртка над системным secure storage (keyring 3). Сервис фиксированный,
/// аккаунт — идентификатор сессии/собеседника. Blob состояния Double
/// Ratchet содержит СЕКРЕТЫ — хранить можно ТОЛЬКО здесь, никогда
/// в файлах, логах или на сервере. На платформах вне windows/linux
/// (целевые ОС desktop — их две) команды возвращают явную ошибку.
#[cfg(any(target_os = "linux", target_os = "windows"))]
mod secure_store {
    use keyring::Entry;

    const SERVICE: &str = "medchat.ratchet";

    pub fn save(account: &str, blob: &[u8]) -> Result<(), String> {
        let entry = Entry::new(SERVICE, account).map_err(|e| format!("keyring entry: {e}"))?;
        entry.set_secret(blob).map_err(|e| format!("keyring set: {e}"))
    }

    pub fn load(account: &str) -> Result<Vec<u8>, String> {
        let entry = Entry::new(SERVICE, account).map_err(|e| format!("keyring entry: {e}"))?;
        entry.get_secret().map_err(|e| format!("keyring get: {e}"))
    }

    pub fn delete(account: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE, account).map_err(|e| format!("keyring entry: {e}"))?;
        entry.delete_credential().map_err(|e| format!("keyring delete: {e}"))
    }
}

/// Сохранить blob состояния Double Ratchet (bincode, feature serde ядра)
/// в системное secure storage. Blob содержит секреты сессии.
#[tauri::command]
fn ratchet_save(account: String, blob: Vec<u8>) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        secure_store::save(&account, &blob)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (account, blob);
        Err("secure storage недоступен на этой платформе".into())
    }
}

/// Загрузить blob состояния Double Ratchet из secure storage.
#[tauri::command]
fn ratchet_load(account: String) -> Result<Vec<u8>, String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        secure_store::load(&account)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = account;
        Err("secure storage недоступен на этой платформе".into())
    }
}

/// Удалить сохранённое состояние сессии (выход, ротация устройства).
#[tauri::command]
fn ratchet_delete(account: String) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        secure_store::delete(&account)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = account;
        Err("secure storage недоступен на этой платформе".into())
    }
}

/// Smoke: полный цикл персистентности ratchet-сессии через системное
/// secure storage: init -> encrypt -> save -> drop -> load -> restore ->
/// продолжение диалога. Гейтит связку medchat-core(serde) + keyring
/// в контексте приложения (кнопка в ui/index.html).
#[tauri::command]
fn ratchet_storage_probe() -> Result<String, String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        use medchat_core::RatchetState;

        let bob_kp = generate_keypair();
        let mut alice = RatchetState::init_initiator(&[8u8; 32], &bob_kp.public_key);
        let mut bob = RatchetState::init_responder(&[8u8; 32], bob_kp);

        // сообщение до сохранения — состояние уже «живое»
        let m1 = alice
            .encrypt(b"before-save")
            .map_err(|e| format!("encrypt: {e}"))?;
        bob.decrypt(&m1).map_err(|e| format!("decrypt: {e}"))?;

        // «выключение приложения»: состояние -> bincode -> secure storage
        let blob = bincode::serialize(&alice)
            .map_err(|e| format!("serialize: {e}"))?;
        secure_store::save("probe", &blob)?;

        // «включение»: secure storage -> bincode -> состояние; ключ чистим
        let restored = secure_store::load("probe")?;
        secure_store::delete("probe")?;
        let mut alice2: RatchetState = bincode::deserialize(&restored)
            .map_err(|e| format!("deserialize: {e}"))?;

        // диалог продолжается с восстановленного состояния
        let m2 = alice2
            .encrypt(b"after-restore")
            .map_err(|e| format!("encrypt2: {e}"))?;
        let pt = bob.decrypt(&m2).map_err(|e| format!("decrypt2: {e}"))?;
        if pt == b"after-restore".to_vec() {
            Ok(format!("ok: ratchet-сессия пережила save->secure storage->restore ({} байт blob)", blob.len()))
        } else {
            Err("ratchet roundtrip after restore mismatch".into())
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("secure storage недоступен на этой платформе".into())
    }
}

// ----- E2E-конверты x25519-box (этап 7): полный клиентский путь -----

/// Публичный ключ устройства для реестра сервера (POST /api/keys):
/// наружу — только keyId и publicKey (base64), секрет не покидает secure storage.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct E2eKeyInfo {
    key_id: String,
    public_key: String,
}

/// Получатель конверта: userId + publicKey (base64) из реестра
/// GET /api/chats/:id/keys (JS передаёт camelCase-поля, tauri конвертирует).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct E2eRecipient {
    user_id: String,
    public_key: String,
}

/// Компоненты конверта наружу UI: порядок boxes = порядок recipients —
/// JS собирает объект boxes: { [userId]: base64 } (wire-формат сервера
/// и мобильного клиента).
#[derive(serde::Serialize)]
struct E2eEnvelopeParts {
    epk: String,
    nonce: String,
    boxes: Vec<String>,
}

/// Запись пары ключей устройства в secure storage (JSON): keyId — стабильный
/// идентификатор логического устройства (desktop- + hex-отпечаток публичного
/// ключа: ротация пары меняет keyId, старый деактивируется на сервере);
/// secretKey покидает keyring только в память процесса при расшифровке.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct E2eKeyRecord {
    key_id: String,
    public_key: String,
    secret_key: String,
}

/// Secure storage E2E-ключей устройства: отдельный сервис medchat.e2e
/// (не пересекается с ratchet-сессиями medchat.ratchet), аккаунт — e2e.<userId>.
#[cfg(any(target_os = "linux", target_os = "windows"))]
mod e2e_store {
    use keyring::Entry;

    const SERVICE: &str = "medchat.e2e";

    pub fn save(account: &str, blob: &[u8]) -> Result<(), String> {
        let entry = Entry::new(SERVICE, account).map_err(|e| format!("keyring entry: {e}"))?;
        entry.set_secret(blob).map_err(|e| format!("keyring set: {e}"))
    }

    pub fn load(account: &str) -> Result<Vec<u8>, String> {
        let entry = Entry::new(SERVICE, account).map_err(|e| format!("keyring entry: {e}"))?;
        entry.get_secret().map_err(|e| format!("keyring get: {e}"))
    }
}

fn b64_encode(bytes: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.encode(bytes)
}

/// Декодирует base64 и с паддингом, и без (мобильный клиент может слать
/// unpadded) — wire-совместимость важнее строгости одного варианта.
fn b64_decode(text: &str) -> Result<Vec<u8>, String> {
    use base64::{
        engine::general_purpose::{STANDARD, STANDARD_NO_PAD},
        Engine as _,
    };
    STANDARD
        .decode(text)
        .or_else(|_| STANDARD_NO_PAD.decode(text))
        .map_err(|e| format!("base64: {e}"))
}

fn hex_prefix(bytes: &[u8], len: usize) -> String {
    bytes
        .iter()
        .map(|b| format!("{b:02x}"))
        .take(len)
        .collect()
}

/// Получить (или при первом запуске создать и сохранить в secure storage)
/// пару ключей устройства X25519. Приватный ключ никогда не покидает устройство.
#[tauri::command]
fn e2e_get_or_create_key(user_id: String) -> Result<E2eKeyInfo, String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        let account = format!("e2e.{user_id}");
        let record = match e2e_store::load(&account) {
            Ok(blob) => serde_json::from_slice::<E2eKeyRecord>(&blob)
                .map_err(|e| format!("key record parse: {e}"))?,
            Err(_) => {
                // Первая регистрация устройства: пара X25519 + стабильный keyId.
                // Ошибка чтения трактуется как «записи нет»: перезапись ниже
                // либо честно упадёт на save с той же причиной.
                let kp = generate_keypair();
                let record = E2eKeyRecord {
                    key_id: format!("desktop-{}", hex_prefix(&kp.public_key, 8)),
                    public_key: b64_encode(&kp.public_key),
                    secret_key: b64_encode(&kp.secret_key),
                };
                let blob = serde_json::to_vec(&record)
                    .map_err(|e| format!("key record encode: {e}"))?;
                e2e_store::save(&account, &blob)?;
                record
            }
        };
        Ok(E2eKeyInfo {
            key_id: record.key_id,
            public_key: record.public_key,
        })
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = user_id;
        Err("secure storage недоступен на этой платформе".into())
    }
}

/// Зашифровать plaintext в конверт x25519-box для списка получателей
/// (публичные ключи base64 из реестра). Порядок boxes = порядок recipients.
#[tauri::command]
fn e2e_seal(plaintext: String, recipients: Vec<E2eRecipient>) -> Result<E2eEnvelopeParts, String> {
    let mut pks: Vec<[u8; 32]> = Vec::with_capacity(recipients.len());
    for r in &recipients {
        let raw = b64_decode(&r.public_key)?;
        let pk: [u8; 32] = raw
            .try_into()
            .map_err(|_| "publicKey must be a 32-byte X25519 key".to_string())?;
        pks.push(pk);
    }
    let sealed = seal_for_recipients(plaintext.as_bytes(), &pks)
        .map_err(|e| format!("seal: {e}"))?;
    Ok(E2eEnvelopeParts {
        epk: b64_encode(&sealed.epk),
        nonce: b64_encode(&sealed.nonce),
        boxes: sealed.boxes.iter().map(|b| b64_encode(b)).collect(),
    })
}

/// Расшифровать конверт приватным ключом устройства (из secure storage):
/// open_sealed честно перебирает боксы — берётся первый, который наш ключ
/// открывает. plaintext текстовых боксов обязан быть UTF-8 (клиентский
/// контракт); файловые конверты — честная ошибка, а не тихий мусор.
#[tauri::command]
fn e2e_open(
    user_id: String,
    epk: String,
    nonce: String,
    boxes: Vec<String>,
) -> Result<String, String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        let account = format!("e2e.{user_id}");
        let blob = e2e_store::load(&account)?;
        let record = serde_json::from_slice::<E2eKeyRecord>(&blob)
            .map_err(|e| format!("key record parse: {e}"))?;
        let secret_raw = b64_decode(&record.secret_key)?;
        let secret: [u8; 32] = secret_raw
            .try_into()
            .map_err(|_| "secret key must be 32 bytes".to_string())?;
        let epk_raw = b64_decode(&epk)?;
        let nonce_raw = b64_decode(&nonce)?;
        let sealed = SealedMessage {
            epk: epk_raw
                .try_into()
                .map_err(|_| "epk must be a 32-byte X25519 key".to_string())?,
            nonce: nonce_raw
                .try_into()
                .map_err(|_| "nonce must be 24 bytes".to_string())?,
            boxes: boxes
                .iter()
                .map(|b| b64_decode(b))
                .collect::<Result<Vec<_>, _>>()?,
        };
        let plain = open_sealed(&sealed, &[0u8; 32], &secret)
            .map_err(|e| format!("open: {e}"))?;
        String::from_utf8(plain).map_err(|_| "plaintext не является UTF-8".to_string())
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (user_id, epk, nonce, boxes);
        Err("secure storage недоступен на этой платформе".into())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            core_probe,
            ratchet_probe,
            ratchet_save,
            ratchet_load,
            ratchet_delete,
            ratchet_storage_probe,
            e2e_get_or_create_key,
            e2e_seal,
            e2e_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

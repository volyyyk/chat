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
// Keyring) через крейт keyring 3 (см. Cargo.toml). UI — заглушка-пробы,
// не клиент.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use medchat_core::{generate_keypair, open_sealed, seal_for_recipients};

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            core_probe,
                       ratchet_probe,
            ratchet_save,
            ratchet_load,
            ratchet_delete,
            ratchet_storage_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

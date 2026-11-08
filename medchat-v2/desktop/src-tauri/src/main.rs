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
// wire-циклом. Сборка установщиков (.deb/AppImage/exe) — следующий шаг
// этапа 5; UI — заглушка-пробы, не клиент.

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![core_probe, ratchet_probe])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! Double Ratchet (forward secrecy) — этап 7 ROADMAP_NATIVE.md.
//!
//! Прототип протокола поверх X25519 + XSalsa20-Poly1305-конвертов:
//! - KDF_RK: root key перемешивается DH-выходом при каждой смене
//!   ratchet-ключа собеседника (break-in recovery);
//! - KDF_CK: цепочка сообщений продвигается однонаправленно, ключи
//!   сообщений одноразовые и не хранятся (forward secrecy);
//! - шифрование каждого сообщения AES-256-GCM на одноразовом message key.
//!
//! Честные ограничения прототипа (задокументированы намеренно):
//! - skipped-message-keys store реализован (как в Signal): сообщения
//!   расшифровываются вне порядка; лимиты против DoS — MAX_SKIP ключей
//!   за один шаг и MAX_SKIPPED_KEYS одноразовых ключей в хранилище;
//! - заголовок (dh_pub, pn, n) передаётся открытым текстом — как в Signal;
//! - НЕ интегрирован в клиенты: мобильный клиент работает на конвертах
//!   x25519-box, сервер видит только конверты. Интеграция — после
//!   napi-rs/UniFFI-биндингов и согласования wire-формата.

use std::collections::HashMap;

use crate::{CoreError, KeyPair, KEY_SIZE};
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use hmac::{Hmac, Mac};
use sha2::Sha256;

/// Размер nonce AES-256-GCM (12 байт).
pub const AEAD_NONCE_SIZE: usize = 12;
/// dh_pub (32) + pn (4) + n (4).
const HEADER_SIZE: usize = KEY_SIZE + 4 + 4;
/// Максимум message-ключей, выводимых в skip-store за один шаг (анти-DoS).
pub const MAX_SKIP: u32 = 2000;
/// Максимум одноразовых ключей в skip-store одновременно.
pub const MAX_SKIPPED_KEYS: usize = 500;

type HmacSha256 = Hmac<Sha256>;

fn hmac256(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC accepts any key size");
    mac.update(data);
    let out = mac.finalize().into_bytes();
    let mut res = [0u8; 32];
    res.copy_from_slice(&out);
    res
}

/// KDF_RK: перемешать root key новым DH-выходом. Возвращает (root, chain).
fn kdf_rk(root: &[u8; 32], dh_out: &[u8; KEY_SIZE]) -> ([u8; 32], [u8; 32]) {
    let mut data1 = dh_out.to_vec();
    data1.push(0x01);
    let mut data2 = dh_out.to_vec();
    data2.push(0x02);
    (hmac256(root, &data1), hmac256(root, &data2))
}

/// KDF_CK: продвинуть цепочку. Однонаправленно: из next нельзя вернуть current.
fn kdf_ck(chain: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    (hmac256(chain, &[0x01]), hmac256(chain, &[0x02]))
}

/// Raw X25519 (DH-выход для KDF_RK). Симметричен:
/// x25519(a_priv, b_pub) == x25519(b_priv, a_pub).
fn x25519(secret: &[u8; KEY_SIZE], remote_public: &[u8; KEY_SIZE]) -> [u8; KEY_SIZE] {
    let s = x25519_dalek::StaticSecret::from(*secret);
    let pk = x25519_dalek::PublicKey::from(*remote_public);
    let shared = s.diffie_hellman(&pk);
    let mut out = [0u8; KEY_SIZE];
    out.copy_from_slice(shared.as_bytes());
    out
}

fn serialize_header(dh_pub: &[u8; KEY_SIZE], pn: u32, n: u32) -> Vec<u8> {
    let mut h = Vec::with_capacity(HEADER_SIZE);
    h.extend_from_slice(dh_pub);
    h.extend_from_slice(&pn.to_le_bytes());
    h.extend_from_slice(&n.to_le_bytes());
    h
}

fn parse_header(bytes: &[u8]) -> Result<([u8; KEY_SIZE], u32, u32), CoreError> {
    if bytes.len() != HEADER_SIZE {
        return Err(CoreError::BadHeader);
    }
    let mut dh_pub = [0u8; KEY_SIZE];
    dh_pub.copy_from_slice(&bytes[..KEY_SIZE]);
    let pn = u32::from_le_bytes(bytes[KEY_SIZE..KEY_SIZE + 4].try_into().unwrap());
    let n = u32::from_le_bytes(bytes[KEY_SIZE + 4..HEADER_SIZE].try_into().unwrap());
    Ok((dh_pub, pn, n))
}

/// AEAD-расшифровка одноразовым message key (AES-256-GCM).
fn aead_decrypt(message_key: &[u8; 32], nonce: &[u8; AEAD_NONCE_SIZE], ciphertext: &[u8]) -> Result<Vec<u8>, CoreError> {
    let cipher = Aes256Gcm::new_from_slice(message_key).map_err(|_| CoreError::Aead)?;
    cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| CoreError::Aead)
}

/// Сообщение Double Ratchet: открытый заголовок + AEAD-шифротекст.
/// Заголовок = dh_pub (текущий ratchet-ключ отправителя) || pn || n.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RatchetMessage {
    pub header: Vec<u8>,
    pub nonce: [u8; AEAD_NONCE_SIZE],
    pub ciphertext: Vec<u8>,
}

/// Состояние Double Ratchet одной стороны диалога.
///
/// Секретные поля (root_key, цепочки, dh_self.secret_key) НИКОГДА не
/// сериализуются наружу целиком в проде — хранить только в secure storage
/// устройства; состояние serializable только для персистентности сессии.
#[derive(Debug, Clone)]
pub struct RatchetState {
    root_key: [u8; 32],
    dh_self: KeyPair,
    dh_remote: Option<[u8; KEY_SIZE]>,
    chain_send: Option<[u8; 32]>,
    chain_recv: Option<[u8; 32]>,
    send_count: u32,
    recv_count: u32,
    prev_send_count: u32,
    /// Одноразовые ключи пропущенных сообщений: (dh_pub, n) -> message_key.
    skipped: HashMap<([u8; KEY_SIZE], u32), [u8; 32]>,
}

impl RatchetState {
    /// Инициирующая сторона (пишет первой). shared_secret — предварительный
    /// DH (например, X25519 от identity-ключей из реестра UserKey),
    /// remote_ratchet_public — ratchet-ключ собеседника.
    pub fn init_initiator(
        shared_secret: &[u8; 32],
        remote_ratchet_public: &[u8; KEY_SIZE],
    ) -> Self {
        let dh_self = crate::generate_keypair();
        let dh_out = x25519(&dh_self.secret_key, remote_ratchet_public);
        let (root, chain_send) = kdf_rk(shared_secret, &dh_out);
        RatchetState {
            root_key: root,
            dh_self,
            dh_remote: Some(*remote_ratchet_public),
            chain_send: Some(chain_send),
            chain_recv: None,
            skipped: HashMap::new(),
            send_count: 0,
            recv_count: 0,
            prev_send_count: 0,
        }
    }

    /// Отвечающая сторона: отправка невозможна до первого полученного
    /// сообщения (нужен ratchet-ключ собеседника — как PreKey в Signal).
    pub fn init_responder(shared_secret: &[u8; 32], my_ratchet_keypair: KeyPair) -> Self {
        RatchetState {
            root_key: *shared_secret,
            dh_self: my_ratchet_keypair,
            dh_remote: None,
            chain_send: None,
            chain_recv: None,
            skipped: HashMap::new(),
            send_count: 0,
            recv_count: 0,
            prev_send_count: 0,
        }
    }

    /// Зашифровать сообщение: продвинуть цепочку отправки, одноразовый
    /// message key -> AES-256-GCM. DH-ratchet здесь НЕ выполняется (только
    /// на decrypt при смене ключа собеседника) — как в Signal.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<RatchetMessage, CoreError> {
        let chain = self
            .chain_send
            .as_mut()
            .ok_or(CoreError::NotInitialized)?;
        let (next_chain, message_key) = kdf_ck(chain);
        *chain = next_chain;

        let n = self.send_count;
        self.send_count += 1;

        let header = serialize_header(&self.dh_self.public_key, self.prev_send_count, n);

        let cipher = Aes256Gcm::new_from_slice(&message_key).map_err(|_| CoreError::Aead)?;
        let mut rng = OsRng;
        let nonce = Aes256Gcm::generate_nonce(&mut rng);
        let mut nonce_arr = [0u8; AEAD_NONCE_SIZE];
        nonce_arr.copy_from_slice(nonce.as_slice());

        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce_arr), plaintext)
            .map_err(|_| CoreError::Aead)?;

        Ok(RatchetMessage {
            header,
            nonce: nonce_arr,
            ciphertext,
        })
    }

    /// Расшифровать сообщение. Если dh_pub из заголовка отличается от
    /// текущего ключа собеседника — выполняется DH-ratchet: оба root и
    /// цепочки перевыводятся, счётчики сбрасываются.
    pub fn decrypt(&mut self, msg: &RatchetMessage) -> Result<Vec<u8>, CoreError> {
        let (dh_pub, pn, n) = parse_header(&msg.header)?;

        // 1. Ключ пропущенного сообщения (skip-store): одноразовый,
        //    изымается из хранилища при использовании.
        if let Some(message_key) = self.skipped.remove(&(dh_pub, n)) {
            return aead_decrypt(&message_key, &msg.nonce, &msg.ciphertext);
        }

        // 2. DH-ratchet при смене ключа собеседника: сначала сохраняем
        //    ключи пропущенных сообщений ЕГО старой цепочки (до pn).
        if self.dh_remote.map_or(true, |r| r != dh_pub) {
            self.skip_message_keys(pn)?;

            let dh_out = x25519(&self.dh_self.secret_key, &dh_pub);
            let (root, chain_recv) = kdf_rk(&self.root_key, &dh_out);
            self.root_key = root;
            self.chain_recv = Some(chain_recv);
            self.recv_count = 0;
            self.dh_remote = Some(dh_pub);

            // свой новый ratchet-ключ + исходящая цепочка под него
            self.dh_self = crate::generate_keypair();
            let dh_out2 = x25519(&self.dh_self.secret_key, &dh_pub);
            let (root2, chain_send) = kdf_rk(&self.root_key, &dh_out2);
            self.root_key = root2;
            self.chain_send = Some(chain_send);
            self.prev_send_count = self.send_count;
            self.send_count = 0;
        }

        // 3. Пропустить ключи до n в текущей входящей цепочке
        if n > self.recv_count {
            self.skip_message_keys(n)?;
        }
        if n < self.recv_count {
            // ключ для n уже выведен и использован — повтор = replay
            return Err(CoreError::OutOfOrder);
        }

        let chain = self
            .chain_recv
            .as_mut()
            .ok_or(CoreError::NotInitialized)?;
        let (next_chain, message_key) = kdf_ck(chain);
        *chain = next_chain;
        self.recv_count += 1;

        aead_decrypt(&message_key, &msg.nonce, &msg.ciphertext)
    }

    /// Вывести и сохранить одноразовые ключи сообщений [recv_count, until)
    /// текущей входящей цепочки (skip-store, как в Signal). Лимиты: не более
    /// MAX_SKIP ключей за один шаг и MAX_SKIPPED_KEYS в хранилище (анти-DoS).
    fn skip_message_keys(&mut self, until: u32) -> Result<(), CoreError> {
        if self.chain_recv.is_none() {
            // входящей цепочки ещё нет (первое сообщение) — нечего пропускать
            return Ok(());
        }
        if until.saturating_sub(self.recv_count) > MAX_SKIP {
            return Err(CoreError::OutOfOrder);
        }
        while self.recv_count < until {
            if self.skipped.len() >= MAX_SKIPPED_KEYS {
                return Err(CoreError::OutOfOrder);
            }
            let chain = self
                .chain_recv
                .as_mut()
                .ok_or(CoreError::NotInitialized)?;
            let (next_chain, message_key) = kdf_ck(chain);
            *chain = next_chain;
            let dh = self.dh_remote.ok_or(CoreError::NotInitialized)?;
            self.skipped.insert((dh, self.recv_count), message_key);
            self.recv_count += 1;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generate_keypair;

    /// Живая сессия: identity-ключи обоих, одинаковый shared secret
    /// (как из реестра публичных ключей UserKey), ratchet-ключ Боба.
    fn session() -> (RatchetState, RatchetState) {
        let alice_identity = generate_keypair();
        let bob_identity = generate_keypair();
        let sk_a = x25519(&alice_identity.secret_key, &bob_identity.public_key);
        let sk_b = x25519(&bob_identity.secret_key, &alice_identity.public_key);
        assert_eq!(sk_a, sk_b);

        let bob_ratchet = generate_keypair();
        let alice = RatchetState::init_initiator(&sk_a, &bob_ratchet.public_key);
        let bob = RatchetState::init_responder(&sk_b, bob_ratchet);
        (alice, bob)
    }

    #[test]
    fn bidirectional_roundtrip_multiple_ratchets() {
        let (mut alice, mut bob) = session();

        // Alice -> Bob (первое сообщение инициирует ratchet у Боба)
        let m1 = alice.encrypt(b"Hello doctor").unwrap();
        assert_eq!(bob.decrypt(&m1).unwrap(), b"Hello doctor".to_vec());

        // Bob -> Alice (Bob отвечает: Alice делает ratchet на его новом ключе)
        let m2 = bob.encrypt(b"Hello patient").unwrap();
        assert_eq!(alice.decrypt(&m2).unwrap(), b"Hello patient".to_vec());

        // несколько сообщений в одну сторону без ratchet
        for i in 0..5u8 {
            let m = alice.encrypt(&[b'a', i]).unwrap();
            assert_eq!(bob.decrypt(&m).unwrap(), vec![b'a', i]);
        }

        // и обратно
        for i in 0..5u8 {
            let m = bob.encrypt(&[b'b', i]).unwrap();
            assert_eq!(alice.decrypt(&m).unwrap(), vec![b'b', i]);
        }
    }

    #[test]
    fn forward_secrecy_old_message_keys_gone() {
        let (mut alice, mut bob) = session();
        let m1 = alice.encrypt(b"first").unwrap();
        assert_eq!(bob.decrypt(&m1).unwrap(), b"first".to_vec());

        // тот же n повторно = ключ цепочки уже продвинут — сообщение
        // старым ключом не расшифровывается (forward secrecy)
        let replay = RatchetMessage {
            header: m1.header.clone(),
            nonce: m1.nonce,
            ciphertext: m1.ciphertext.clone(),
        };
        assert_eq!(bob.decrypt(&replay), Err(CoreError::OutOfOrder));

        // второе сообщение ок
        let m2 = alice.encrypt(b"second").unwrap();
        assert_eq!(bob.decrypt(&m2).unwrap(), b"second".to_vec());
    }

    #[test]
    fn out_of_order_decoded_via_skip_store() {
        let (mut alice, mut bob) = session();
        let m1 = alice.encrypt(b"one").unwrap();
        let m2 = alice.encrypt(b"two").unwrap();

        // m2 приходит раньше m1: skip-store выводит ключ n=1 и расшифровывает
        assert_eq!(bob.decrypt(&m2).unwrap(), b"two".to_vec());
        // m1 доходит позже и расшифровывается из skip-store
        assert_eq!(bob.decrypt(&m1).unwrap(), b"one".to_vec());
        // повтор m2: ключ уже израсходован (одноразовость), replay отклонён
        let replay = RatchetMessage {
            header: m2.header.clone(),
            nonce: m2.nonce,
            ciphertext: m2.ciphertext.clone(),
        };
        assert_eq!(bob.decrypt(&replay), Err(CoreError::OutOfOrder));
    }

    #[test]
    fn too_many_skipped_rejected() {
        let (mut alice, mut bob) = session();
        let m1 = alice.encrypt(b"x").unwrap();
        // подделанный заголовок с далёким n: skip-store отказывает (анти-DoS)
        let mut m = RatchetMessage {
            header: m1.header.clone(),
            nonce: m1.nonce,
            ciphertext: m1.ciphertext.clone(),
        };
        let n = MAX_SKIP + 5;
        m.header[KEY_SIZE + 4..HEADER_SIZE].copy_from_slice(&n.to_le_bytes());
        assert_eq!(bob.decrypt(&m), Err(CoreError::OutOfOrder));
    }

    #[test]
    fn responder_cannot_send_before_first_receive() {
        let (_alice, mut bob) = session();
        assert_eq!(bob.encrypt(b"early"), Err(CoreError::NotInitialized));
    }

    #[test]
    fn tampered_ciphertext_rejected() {
        let (mut alice, mut bob) = session();
        let mut m = alice.encrypt(b"integrity").unwrap();
        m.ciphertext[0] ^= 0xFF;
        assert_eq!(bob.decrypt(&m), Err(CoreError::Aead));
    }

    #[test]
    fn bad_header_rejected() {
        let (mut alice, mut bob) = session();
        let mut m = alice.encrypt(b"x").unwrap();
        m.header.truncate(10);
        assert_eq!(bob.decrypt(&m), Err(CoreError::BadHeader));
    }

    #[test]
    fn headers_advance_counter() {
        let (mut alice, mut _bob) = session();
        let h1 = alice.encrypt(b"1").unwrap().header;
        let h2 = alice.encrypt(b"2").unwrap().header;
        // одинаковый dh_pub (ratchet не менялся), разные n
        assert_eq!(h1[..KEY_SIZE], h2[..KEY_SIZE]);
        assert_ne!(h1[KEY_SIZE..], h2[KEY_SIZE..]);
    }
}

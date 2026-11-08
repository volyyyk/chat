import SwiftUI

// Переписка (зеркало desktop): сообщения + отправка. E2E-конверты
// x25519-box (metadata.e2e) расшифровываются на устройстве приватным
// ключом из Keychain (CryptoService.openEnvelope); отправка шифруется,
// только если у КАЖДОГО участника есть активный ключ
// (GET /api/chats/:id/keys), иначе честный plaintext — «чат никогда
// не ломается» (как в мобильном клиенте). 402 — тариф исчерпан.
// Double Ratchet (этап 7, зеркало desktop-склейки): при включённом
// тумблере plaintext конверта — payload {"t":"r1","k":keyId,"w":wire}
// (wire ratchet-сообщения), состояние сессии — в Keychain через
// RatchetService (аккаунт ratchet.<chatId>.<remoteKeyId>); тумблер
// per-chat в UserDefaults (НЕ секрет). Любая ошибка ratchet —
// honest-fallback на обычный E2E-конверт; входящие расшифровываются
// лениво, при неудаче — честная плашка: чат никогда не ломается.

struct ChatView: View {
    let chat: ApiService.ChatSummary
    @EnvironmentObject var app: AppState
    
    @State private var messages: [ApiService.ChatMessage] = []
    @State private var texts: [String: String] = [:]
    @State private var e2eMessageIds: Set<String> = []
    @State private var ratchetMessageIds: Set<String> = []
    @State private var chatKeys: [ApiService.ChatKey] = []
    @State private var chatE2E = false
    @State private var ratchetEnabled = false
    @State private var ratchetNote = ""
    @State private var input = ""
    @State private var status = ""
    @State private var sending = false
    
    // Тумблер Double Ratchet per-chat: НЕ секрет, поэтому UserDefaults
    // (секреты — только Keychain, INTEGRATION_BINDINGS §1).
    private var ratchetStorageKey: String {
        return "medchat.ratchet." + chat.id
    }
    
    var body: some View {
        VStack(spacing: 0) {
            if chatE2E {
                Label("E2E: сообщения этого чата шифруются на устройстве", systemImage: "lock")
                    .font(.footnote)
                    .padding(6)
            } else if app.e2eEnabled {
                Text("E2E недоступен: не у всех участников есть активный ключ — отправка в plaintext")
                    .font(.footnote)
                    .foregroundColor(.orange)
                    .padding(6)
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    if messages.isEmpty {
                        Text("Сообщений пока нет")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .padding()
                    }
                    ForEach(messages) { message in
                        bubble(message)
                    }
                }
                .padding()
            }
            if chatE2E {
                Toggle("Double Ratchet (forward secrecy)", isOn: $ratchetEnabled)
                    .font(.footnote)
                    .padding(.horizontal)
                    .onChange(of: ratchetEnabled) { value in
                        UserDefaults.standard.set(value, forKey: ratchetStorageKey)
                    }
            }
            HStack {
                TextField("Сообщение", text: $input)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await send() } }
                Button(sending ? "..." : "Отправить") { Task { await send() } }
                    .disabled(sending)
            }
            .padding()
            if !ratchetNote.isEmpty {
                Text(ratchetNote)
                    .font(.footnote)
                    .foregroundColor(.orange)
                    .padding(.horizontal)
            }
            if !status.isEmpty {
                Text(status)
                    .font(.footnote)
                    .foregroundColor(.red)
                    .padding(.horizontal)
            }
        }
        .navigationTitle(chat.title.isEmpty ? "Чат" : chat.title)
        .task { await reload() }
    }
    
    private func bubble(_ message: ApiService.ChatMessage) -> some View {
        let mine = message.senderId == (app.user?.id ?? "")
        return HStack {
            if mine { Spacer(minLength: 48) }
            VStack(alignment: .leading, spacing: 2) {
                Text(texts[message.id] ?? message.content)
                Text(meta(message))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            .padding(10)
            .background(mine ? Color.accentColor.opacity(0.16) : Color.gray.opacity(0.14))
            .cornerRadius(12)
            if !mine { Spacer(minLength: 48) }
        }
    }
    
    private func meta(_ message: ApiService.ChatMessage) -> String {
        let mine = message.senderId == (app.user?.id ?? "")
        var who = mine ? "Я" : (message.senderFirstName.isEmpty ? "Собеседник" : message.senderFirstName)
        if let date = Self.parseDate(message.createdAt) {
            who += " · " + date.formatted(date: .omitted, time: .shortened)
        }
        if e2eMessageIds.contains(message.id) {
            who += " · 🔒"
        }
        if ratchetMessageIds.contains(message.id) {
            who += " · ratchet"
        }
        return who
    }
    
    private func participants() -> [String] {
        var ids: [String] = []
        if let doctor = chat.doctorUserId { ids.append(doctor) }
        if let patient = chat.patientUserId { ids.append(patient) }
        if let me = app.user?.id { ids.append(me) }
        var seen: Set<String> = []
        return ids.filter { seen.insert($0).inserted }
    }
    
    private func reload() async {
        status = ""
        guard let service = app.api else { return }
        do {
            let list = try await service.messages(chatId: chat.id)
            chatKeys = (try? await service.chatKeys(chatId: chat.id)) ?? []
            let covered = Set(chatKeys.map { $0.userId })
            let ids = participants()
            chatE2E = app.e2eEnabled && app.crypto != nil && !ids.isEmpty && ids.allSatisfy { covered.contains($0) }
            ratchetEnabled = (UserDefaults.standard.object(forKey: ratchetStorageKey) as? Bool) ?? true
            messages = list
            var decoded: [String: String] = [:]
            var encryptedIds: Set<String> = []
            var ratchetIds: Set<String> = []
            for message in list {
                if let rawEnvelope = message.e2eEnvelope {
                    encryptedIds.insert(message.id)
                    if let envelope = CryptoService.envelopeFrom(rawEnvelope),
                       let cryptoService = app.crypto,
                       let plaintext = cryptoService.openEnvelope(envelope) {
                        if let unwrapped = ratchetUnwrap(plaintext) {
                            decoded[message.id] = unwrapped.text
                            if unwrapped.isRatchet {
                                ratchetIds.insert(message.id)
                            }
                        } else {
                            decoded[message.id] = plaintext
                        }
                    } else {
                        decoded[message.id] = "🔒 Зашифровано (E2E): нет бокса для ключа этого устройства"
                    }
                } else {
                    decoded[message.id] = message.content
                }
            }
            texts = decoded
            e2eMessageIds = encryptedIds
            ratchetMessageIds = ratchetIds
        } catch {
            status = "Ошибка загрузки: " + apiErrorMessage(error)
        }
    }
    
    private func send() async {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }
        guard let service = app.api else { return }
        sending = true
        status = ""
        ratchetNote = ""
        var outgoing = text
        if chatE2E, ratchetEnabled {
            if let payload = ratchetPayload(text) {
                outgoing = payload
            }
        }
        do {
            if chatE2E, let envelope = buildEnvelope(outgoing) {
                try await service.send(chatId: chat.id, content: "", envelope: envelope)
            } else {
                try await service.send(chatId: chat.id, content: text)
            }
            input = ""
            await reload()
        } catch let apiError as ApiError where apiError.status == 402 {
            status = "Лимит сообщений тарифа исчерпан (402): пополните счёт"
        } catch {
            status = "Не отправлено: " + apiErrorMessage(error)
        }
        sending = false
    }
    
    // Последний чужой активный ключ чата (зеркало desktop peerKey):
    // ratchet-сессия ведётся с устройством собеседника.
    private func peerKey() -> ApiService.ChatKey? {
        guard let me = app.user?.id else { return nil }
        return chatKeys.filter { $0.userId != me }.last
    }
    
    // Исходящий ratchet-payload: wire шифруется сессией с собеседником
    // и заворачивается в JSON {"t":"r1","k":keyId,"w":wire} — тот же
    // формат, что в desktop. Ошибка (нет ключа собеседника, отвечающая
    // сторона пишет первой — NotInitialized) — nil + честная плашка:
    // уйдёт обычный E2E-конверт, чат не ломается.
    private func ratchetPayload(_ text: String) -> String? {
        guard let crypto = app.crypto, let pair = crypto.getOrCreateKeyPair(),
              let peer = peerKey() else {
            ratchetNote = "Ratchet: нет ключа собеседника — отправлено обычным E2E-конвертом"
            return nil
        }
        do {
            let state = try RatchetService.shared.ensureSession(chatId: chat.id, myPair: pair, remoteKey: peer)
            let wire = try RatchetService.shared.encrypt(chatId: chat.id, remoteKeyId: peer.keyId, plaintext: Data(text.utf8), state: state)
            let payload: [String: Any] = ["t": "r1", "k": pair.keyId, "w": wire.base64EncodedString()]
            if let data = try? JSONSerialization.data(withJSONObject: payload),
               let json = String(data: data, encoding: .utf8) {
                return json
            }
            ratchetNote = "Ratchet: payload не собрался — отправлено обычным E2E-конвертом"
            return nil
        } catch {
            ratchetNote = "Ratchet: сессия не готова (собеседник ещё не писал) — отправлено обычным E2E-конвертом"
            return nil
        }
    }
    
    // Входящий plaintext конверта: обычный текст (nil — показать как есть)
    // или ratchet-payload {"t":"r1","k":keyId,"w":wire}. Расшифровка
    // ленивая, сессией с отправителем (его ключ — по keyId из реестра
    // чата); не расшифровалось — честная плашка, чат не ломается.
    private func ratchetUnwrap(_ plaintext: String) -> (text: String, isRatchet: Bool)? {
        guard let data = plaintext.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["t"] as? String == "r1",
              let senderKeyId = object["k"] as? String,
              let wireB64 = object["w"] as? String,
              let wire = Data(base64Encoded: wireB64) else { return nil }
        guard let crypto = app.crypto, let pair = crypto.getOrCreateKeyPair(),
              let remoteKey = chatKeys.first(where: { $0.keyId == senderKeyId }) else {
            return ("🔒 Ratchet-сообщение: нет ключа отправителя в реестре чата", true)
        }
        do {
            let state = try RatchetService.shared.ensureSession(chatId: chat.id, myPair: pair, remoteKey: remoteKey)
            let plain = try RatchetService.shared.decrypt(chatId: chat.id, remoteKeyId: senderKeyId, wire: wire, state: state)
            return (String(data: plain, encoding: .utf8) ?? "🔒 Ratchet: не удалось прочитать текст", true)
        } catch {
            return ("🔒 Ratchet-сообщение не расшифровано (сессия не совпала)", true)
        }
    }
    
    // Конверт: по боксу на участника (последний активный ключ), бокс
    // отправителя обязателен — сервер это проверяет.
    private func buildEnvelope(_ text: String) -> E2EEnvelope? {
        guard let crypto = app.crypto else { return nil }
        var latest: [String: ApiService.ChatKey] = [:]
        for key in chatKeys {
            latest[key.userId] = key
        }
        let ids = participants()
        var recipients: [(userId: String, publicKeyB64: String)] = []
        for userId in ids {
            if let key = latest[userId] {
                recipients.append((userId, key.publicKey))
            }
        }
        guard recipients.count == ids.count else { return nil }
        return crypto.buildEnvelope(plaintext: text, recipients: recipients)
    }
    
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    
    private static let plainFormatter = ISO8601DateFormatter()
    
    private static func parseDate(_ raw: String) -> Date? {
        guard !raw.isEmpty else { return nil }
        return fractionalFormatter.date(from: raw) ?? plainFormatter.date(from: raw)
    }
}

import SwiftUI

// Переписка (зеркало desktop): сообщения + отправка. E2E-конверты
// x25519-box (metadata.e2e) расшифровываются на устройстве приватным
// ключом из Keychain (CryptoService.openEnvelope); отправка шифруется,
// только если у КАЖДОГО участника есть активный ключ
// (GET /api/chats/:id/keys), иначе честный plaintext — «чат никогда
// не ломается» (как в мобильном клиенте). 402 — тариф исчерпан.

struct ChatView: View {
    let chat: ApiService.ChatSummary
    @EnvironmentObject var app: AppState
    
    @State private var messages: [ApiService.ChatMessage] = []
    @State private var texts: [String: String] = [:]
    @State private var e2eMessageIds: Set<String> = []
    @State private var chatKeys: [ApiService.ChatKey] = []
    @State private var chatE2E = false
    @State private var input = ""
    @State private var status = ""
    @State private var sending = false
    
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
            HStack {
                TextField("Сообщение", text: $input)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await send() } }
                Button(sending ? "..." : "Отправить") { Task { await send() } }
                    .disabled(sending)
            }
            .padding()
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
            messages = list
            var decoded: [String: String] = [:]
            var encryptedIds: Set<String> = []
            for message in list {
                if let rawEnvelope = message.e2eEnvelope {
                    encryptedIds.insert(message.id)
                    if let envelope = CryptoService.envelopeFrom(rawEnvelope),
                       let cryptoService = app.crypto,
                       let plaintext = cryptoService.openEnvelope(envelope) {
                        decoded[message.id] = plaintext
                    } else {
                        decoded[message.id] = "🔒 Зашифровано (E2E): нет бокса для ключа этого устройства"
                    }
                } else {
                    decoded[message.id] = message.content
                }
            }
            texts = decoded
            e2eMessageIds = encryptedIds
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
        do {
            if chatE2E, let envelope = buildEnvelope(text) {
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

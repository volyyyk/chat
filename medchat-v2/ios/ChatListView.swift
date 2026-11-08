import SwiftUI

// Список чатов (зеркало desktop): GET /api/chats?limit=50, выбор чата —
// переход в ChatView. Выход сбрасывает токен (Keychain) и сессию.

struct ChatListView: View {
    @EnvironmentObject var app: AppState
    @State private var chats: [ApiService.ChatSummary] = []
    @State private var status = ""
    
    var body: some View {
        NavigationStack {
            List {
                if chats.isEmpty {
                    Text(status.isEmpty ? "Чатов нет" : status)
                        .foregroundColor(.secondary)
                }
                ForEach(chats) { chat in
                    NavigationLink {
                        ChatView(chat: chat)
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(chat.title.isEmpty ? "Чат" : chat.title)
                                .font(.headline)
                            Text(subtitle(chat))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("MedChat")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button("Обновить") { Task { await load() } }
                    Button("Выйти") { app.logout() }
                }
            }
            .refreshable { await load() }
        }
        .task { await load() }
    }
    
    private func subtitle(_ chat: ApiService.ChatSummary) -> String {
        var text = chat.lastMessageText.isEmpty ? "нет сообщений" : chat.lastMessageText
        if let date = Self.parseDate(chat.lastMessageAt) {
            text += " · " + date.formatted(date: .abbreviated, time: .omitted)
        }
        return text
    }
    
    private func load() async {
        status = ""
        guard let service = app.api else { return }
        do {
            chats = try await service.chats()
        } catch {
            status = "Чаты не загрузились: " + apiErrorMessage(error)
        }
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

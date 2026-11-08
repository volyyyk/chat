import SwiftUI

// Экраны входа (зеркало desktop ui/index.html): connect — выбор сервера
// (GET /health), login — POST /api/auth/login. accessToken хранится в
// Keychain (medchat.app); refreshToken сознательно не хранится.

struct ConnectView: View {
    @EnvironmentObject var app: AppState
    @State private var urlText = ""
    @State private var busy = false
    
    var body: some View {
        VStack(spacing: 14) {
            Text("MedChat").font(.largeTitle.bold())
            Text("Укажите адрес API-сервера MedChat. Соединение проверяется автоматически перед входом.")
                .font(.footnote)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            TextField("http://localhost:3000", text: $urlText)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .onSubmit { Task { await submit() } }
            Button(busy ? "Проверяем..." : "Проверить и продолжить") { Task { await submit() } }
                .buttonStyle(.borderedProminent)
                .disabled(busy)
            if !app.lastError.isEmpty {
                Text(app.lastError).font(.footnote).foregroundColor(.red)
            }
        }
        .padding(32)
        .onAppear { urlText = app.server }
    }
    
    private func submit() async {
        busy = true
        await app.connect(to: urlText)
        busy = false
    }
}

struct LoginView: View {
    @EnvironmentObject var app: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    
    var body: some View {
        VStack(spacing: 14) {
            Text("Вход").font(.title.bold())
            Text("Сервер: " + app.server).font(.footnote).foregroundColor(.secondary)
            TextField("patient1@medchat.test", text: $email)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .onSubmit { Task { await submit() } }
            SecureField("Пароль", text: $password)
                .textFieldStyle(.roundedBorder)
                .onSubmit { Task { await submit() } }
            Button(busy ? "Входим..." : "Войти") { Task { await submit() } }
                .buttonStyle(.borderedProminent)
                .disabled(busy)
            Button("Сменить сервер") { app.screen = .connect }
                .buttonStyle(.bordered)
            if !app.lastError.isEmpty {
                Text(app.lastError).font(.footnote).foregroundColor(.red)
            }
        }
        .padding(32)
        .onAppear { email = KeychainStore.get("email") ?? "" }
    }
    
    private func submit() async {
        busy = true
        await app.login(email: email, password: password)
        busy = false
    }
}

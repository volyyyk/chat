package medchat.android

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.json.JSONObject

// Compose UI Android-клиента (этап 4 ч.3) — зеркало desktop-клиента
// (desktop/ui/index.html) и iOS (ChatView):
//   connect → login → chats → chat.
// Сеть — в фоновом потоке (Thread), состояние — Compose snapshot
// (запись из фонового потока допустима). accessToken — 30 минут, refresh
// сознательно не хранится: 401 → onUnauthorized → экран входа. Токен,
// адрес сервера, email и userId — SecureStore (medchat.app, шифротекст
// под мастер-ключом Android Keystore; в отличие от desktop-localStorage
// — секрет не лежит в plaintext).
// E2E: конверт x25519-box при полном покрытии ключами участников
// (content пуст, по боксу на участника — последний активный ключ, бокс
// отправителя обязателен), honest-fallback на plaintext; входящие
// расшифровываются лениво, при неудаче — честная плашка. Ratchet-payload
// {"t":"r1",...} от desktop/iOS — честная плашка (как в RN): склейка
// Double Ratchet в Android-клиенте — остаток этапа 7 (RatchetService
// готов, путь отправки пока не переключён).

private const val KEY_SERVER = "server"
private const val KEY_TOKEN = "token"
private const val KEY_EMAIL = "email"
private const val KEY_USER_ID = "userId"

private const val RATCHET_BADGE = "🔒 Сообщение Double Ratchet — расшифровка в клиентах с ratchet-склейкой"

private fun isRatchetPayload(text: String): Boolean {
    if (!text.startsWith("{")) {
        return false
    }
    return try {
        val row = JSONObject(text)
        row.optString("t") == "r1" && row.has("k") && row.has("w")
    } catch (e: Exception) {
        false
    }
}

private data class UiMessage(
    val mine: Boolean,
    val text: String,
    val time: String)

@Composable
fun MedchatApp() {
    MaterialTheme {
        var screen by remember { mutableStateOf("connect") }
        var api by remember { mutableStateOf<ApiService?>(null) }
        var busy by remember { mutableStateOf(false) }
        var status by remember { mutableStateOf<String?>(null) }
        var userId by remember { mutableStateOf<String?>(null) }
        var chats by remember { mutableStateOf(listOf<ChatSummary>()) }
        var openChat by remember { mutableStateOf<ChatSummary?>(null) }
        val messages = remember { mutableStateListOf<UiMessage>() }

        fun resetToLogin() {
            SecureStore.delete(KEY_TOKEN)
            api = null
            userId = null
            openChat = null
            screen = "login"
        }

        fun loadChats() {
            val service = api ?: return
            busy = true
            status = null
            Thread {
                try {
                    chats = service.chats()
                } catch (e: Exception) {
                    status = e.message ?: "ошибка сети"
                }
                busy = false
            }.start()
        }

        fun loadMessages(chatId: String) {
            val service = api ?: return
            val uid = userId ?: return
            busy = true
            status = null
            Thread {
                try {
                    val rows = service.messages(chatId)
                    val crypto = CryptoService(uid)
                    val parsed = ArrayList<UiMessage>()
                    for (row in rows) {
                        val envelope = CryptoService.envelopeFrom(row.e2eEnvelope)
                        var text = row.content
                        if (envelope != null) {
                            val opened = crypto.openEnvelope(envelope)
                            text = if (opened != null) opened else "🔒 Не удалось расшифровать (нет ключа этого устройства)"
                        }
                        if (isRatchetPayload(text)) {
                            text = RATCHET_BADGE
                        }
                        parsed.add(UiMessage(row.senderId == uid, text, row.createdAt))
                    }
                    messages.clear()
                    messages.addAll(parsed)
                } catch (e: Exception) {
                    status = e.message ?: "ошибка сети"
                }
                busy = false
            }.start()
        }

        fun sendText(chatId: String, text: String) {
            val service = api ?: return
            val uid = userId ?: return
            if (text.isEmpty()) {
                return
            }
            busy = true
            status = null
            Thread {
                try {
                    val keys = service.chatKeys(chatId)
                    val byUser = LinkedHashMap<String, String>()
                    for (key in keys) {
                        byUser[key.userId] = key.publicKey
                    }
                    val mine = byUser[uid]
                    val envelope = if (byUser.isNotEmpty() && mine != null) {
                        val recipients = byUser.entries.map { entry -> entry.key to entry.value }
                        CryptoService(uid).buildEnvelope(text, recipients)
                    } else {
                        null
                    }
                    if (envelope != null) {
                        service.send(chatId, "", envelope)
                    } else {
                        service.send(chatId, text)
                    }
                    loadMessages(chatId)
                } catch (e: ApiError) {
                    busy = false
                    status = if (e.status == 402) {
                        "Лимит бесплатных сообщений исчерпан — тариф подключает оператор"
                    } else {
                        e.message ?: "ошибка отправки"
                    }
                } catch (e: Exception) {
                    busy = false
                    status = e.message ?: "ошибка отправки"
                }
            }.start()
        }

        LaunchedEffect(Unit) {
            val server = SecureStore.get(KEY_SERVER)
            val token = SecureStore.get(KEY_TOKEN)
            val savedUserId = SecureStore.get(KEY_USER_ID)
            if (server != null && token != null && savedUserId != null) {
                val service = ApiService.connect(server)
                service.token = token
                service.onUnauthorized = { resetToLogin() }
                api = service
                userId = savedUserId
                screen = "chats"
            }
        }

        LaunchedEffect(screen) {
            if (screen == "chats" && api != null) {
                loadChats()
            }
        }

        when (screen) {
            "connect" -> ConnectScreen(busy, status) { url ->
                val normalized = ApiService.normalize(url)
                busy = true
                status = null
                Thread {
                    val service = ApiService.connect(normalized)
                    try {
                        service.health()
                        SecureStore.set(normalized, KEY_SERVER)
                        api = service
                        screen = "login"
                    } catch (e: Exception) {
                        status = "Сервер недоступен: " + (e.message ?: "ошибка сети")
                    }
                    busy = false
                }.start()
            }
            "login" -> LoginScreen(busy, status) { email, password ->
                val service = api ?: return@LoginScreen
                busy = true
                status = null
                Thread {
                    try {
                        val user = service.login(email, password)
                        SecureStore.set(service.token ?: "", KEY_TOKEN)
                        SecureStore.set(user.id, KEY_USER_ID)
                        SecureStore.set(email, KEY_EMAIL)
                        service.onUnauthorized = { resetToLogin() }
                        userId = user.id
                        val pair = CryptoService(user.id).getOrCreateKeyPair()
                        if (pair != null) {
                            try {
                                service.registerKey(pair.keyId, pair.publicKeyB64)
                            } catch (e: Exception) {
                                // честно: без ключа в реестре исходящие уйдут plaintext
                            }
                        }
                        screen = "chats"
                    } catch (e: Exception) {
                        status = e.message ?: "ошибка входа"
                    }
                    busy = false
                }.start()
            }
            "chats" -> ChatsScreen(chats, busy, status, onOpen = { chat ->
                openChat = chat
                screen = "chat"
                loadMessages(chat.chatId)
            })
            "chat" -> {
                val chat = openChat
                if (chat == null) {
                    ChatsScreen(chats, busy, status, onOpen = { c ->
                        openChat = c
                        screen = "chat"
                        loadMessages(c.chatId)
                    })
                } else {
                    ChatScreen(
                        chat.title,
                        messages,
                        busy,
                        status,
                        onSend = { text -> sendText(chat.chatId, text) },
                        onBack = { openChat = null; screen = "chats" })
                }
            }
        }
    }
}

@Composable
private fun ConnectScreen(busy: Boolean, status: String?, onConnect: (String) -> Unit) {
    var url by remember { mutableStateOf(SecureStore.get(KEY_SERVER) ?: "http://10.0.2.2:3000") }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("MedChat", style = MaterialTheme.typography.headlineMedium)
        Text("Адрес сервера (для эмулятора: http://10.0.2.2:3000)")
        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            label = { Text("Сервер") },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth())
        Button(onClick = { onConnect(url) }, enabled = !busy) {
            Text(if (busy) "Подключение..." else "Подключиться")
        }
        status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun LoginScreen(busy: Boolean, status: String?, onLogin: (String, String) -> Unit) {
    var email by remember { mutableStateOf(SecureStore.get(KEY_EMAIL) ?: "") }
    var password by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Вход", style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Пароль") },
            enabled = !busy,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth())
        Button(
            onClick = { onLogin(email, password) },
            enabled = !busy && email.isNotEmpty() && password.isNotEmpty()) {
            Text(if (busy) "Вход..." else "Войти")
        }
        status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun ChatsScreen(chats: List<ChatSummary>, busy: Boolean, status: String?, onOpen: (ChatSummary) -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Чаты", style = MaterialTheme.typography.headlineSmall)
        if (busy) {
            CircularProgressIndicator()
        }
        status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(chats) { chat ->
                Button(onClick = { onOpen(chat) }, modifier = Modifier.fillMaxWidth()) {
                    Column(horizontalAlignment = Alignment.Start) {
                        Text(chat.title.ifEmpty { "Чат " + chat.chatId })
                        Text(
                            chat.lastMessageText.ifEmpty { "нет сообщений" },
                            style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatScreen(
    title: String,
    messages: List<UiMessage>,
    busy: Boolean,
    status: String?,
    onSend: (String) -> Unit,
    onBack: () -> Unit) {
    var input by remember { mutableStateOf("") }
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onBack) { Text("Назад") }
            Text(title, style = MaterialTheme.typography.titleLarge)
        }
        status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(messages) { message ->
                Text(
                    (if (message.mine) "Вы" else "Собеседник") + " · " + message.time + "\n" + message.text)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("Сообщение") },
                enabled = !busy,
                modifier = Modifier.weight(1f))
            Button(
                onClick = {
                    onSend(input)
                    input = ""
                },
                enabled = !busy && input.isNotEmpty()) {
                Text("→")
            }
        }
        Text(
            "🔒 E2E: конверт при полном покрытии ключами; Double Ratchet — этап 7",
            style = MaterialTheme.typography.bodySmall)
    }
}
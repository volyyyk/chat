package medchat.android

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Base64
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.json.JSONObject

// Compose UI Android-клиента (этап 4 ч.3; ratchet-склейка — этап 7) —
// зеркало desktop-клиента (desktop/ui/index.html) и iOS (ChatView):
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
// расшифровываются лениво, при неудаче — честная плашка.
// Double Ratchet (этап 7, зеркало desktop/iOS): при включённом тумблере
// plaintext конверта — payload {"t":"r1","k":keyId,"w":wire}; сессии
// per-remote через RatchetService (аккаунт ratchet.<chatId>.<remoteKeyId>,
// ss = x25519Dh identity-ключей, роль по keyId); тумблер per-chat —
// флаг «1»/«0» в SecureStore (не секрет). Любая ошибка ratchet —
// honest-fallback на обычный E2E-конверт; входящие ratchet-payload
// расшифровываются лениво, при неудаче — честная плашка: чат никогда
// не ломается.

private const val KEY_SERVER = "server"
private const val KEY_TOKEN = "token"
private const val KEY_EMAIL = "email"
private const val KEY_USER_ID = "userId"

private fun ratchetFlagKey(chatId: String): String = "ratchet.on." + chatId

// Входящий plaintext конверта: обычный текст (null — показать как есть)
// или ratchet-payload {"t":"r1","k":keyId,"w":wire}. Расшифровка ленивая,
// сессией с отправителем (его ключ — по keyId из реестра чата); не
// расшифровалось — честная плашка, чат не ломается (зеркало ChatView).
private fun ratchetUnwrap(
    chatId: String,
    uid: String,
    keys: List<ChatKey>,
    plaintext: String): Pair<String, Boolean>? {
    if (!plaintext.startsWith("{")) {
        return null
    }
    val row = try {
        JSONObject(plaintext)
    } catch (e: Exception) {
        return null
    }
    if (row.optString("t") != "r1") {
        return null
    }
    val senderKeyId = row.optString("k")
    val wireB64 = row.optString("w")
    if (senderKeyId.isEmpty() || wireB64.isEmpty()) {
        return null
    }
    val wire = try {
        Base64.decode(wireB64, Base64.NO_WRAP)
    } catch (e: IllegalArgumentException) {
        return null
    }
    val pair = CryptoService(uid).getOrCreateKeyPair()
        ?: return Pair("🔒 Ratchet-сообщение: нет ключа этого устройства", true)
    val remoteKey = keys.firstOrNull { it.keyId == senderKeyId }
        ?: return Pair("🔒 Ratchet-сообщение: нет ключа отправителя в реестре чата", true)
    return try {
        val ratchet = RatchetService()
        val state = ratchet.ensureSession(chatId, pair, remoteKey)
        Pair(String(ratchet.decrypt(chatId, senderKeyId, wire, state), Charsets.UTF_8), true)
    } catch (e: Exception) {
        Pair("🔒 Ratchet-сообщение не расшифровано (сессия не совпала)", true)
    }
}

private data class UiMessage(
    val mine: Boolean,
    val text: String,
    val time: String,
    val isRatchet: Boolean)

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
        var ratchetOn by remember { mutableStateOf(true) }
        var ratchetNote by remember { mutableStateOf<String?>(null) }
        var olderRemaining by remember { mutableStateOf(0) }
        var loadingOlder by remember { mutableStateOf(false) }
        var loaderRun by remember { mutableStateOf(0) }
        var loaderActive by remember { mutableStateOf(false) }
        var loaderComplete by remember { mutableStateOf(false) }
        var loaderNext by remember { mutableStateOf<(() -> Unit)?>(null) }
        val messages = remember { mutableStateListOf<UiMessage>() }
        val ratchet = remember { RatchetService() }

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

        fun loadMessages(chat: ChatSummary, before: String? = null) {
            val service = api ?: return
            val uid = userId ?: return
            busy = true
            if (before == null) status = null
            if (before != null) loadingOlder = true
            Thread {
                try {
                    val page = service.messagesPage(chat.chatId, before = before)
                    val keys = try {
                        service.chatKeys(chat.chatId)
                    } catch (e: Exception) {
                        emptyList<ChatKey>()
                    }
                    val crypto = CryptoService(uid)
                    val parsed = ArrayList<UiMessage>()
                    for (row in page.rows) {
                        val envelope = CryptoService.envelopeFrom(row.e2eEnvelope)
                        var text = row.content
                        var isRatchet = false
                        if (envelope != null) {
                            val opened = crypto.openEnvelope(envelope)
                            if (opened != null) {
                                val unwrapped = ratchetUnwrap(chat.chatId, uid, keys, opened)
                                if (unwrapped != null) {
                                    text = unwrapped.first
                                    isRatchet = unwrapped.second
                                } else {
                                    text = opened
                                }
                            } else {
                                text = "🔒 Не удалось расшифровать (нет ключа этого устройства)"
                            }
                        }
                        parsed.add(UiMessage(row.senderId == uid, text, row.createdAt, isRatchet))
                    }
                    olderRemaining = Math.max(0, page.total - page.rows.size)
                    if (before == null) {
                        messages.clear()
                        messages.addAll(parsed)
                    } else if (parsed.isNotEmpty()) {
                        messages.addAll(0, parsed)
                    } else {
                        olderRemaining = 0
                    }
                } catch (e: Exception) {
                    status = e.message ?: "ошибка сети"
                }
                busy = false
                loadingOlder = false
            }.start()
        }

        // Исходящий ratchet-payload: wire шифруется сессией с собеседником
        // и заворачивается в JSON {"t":"r1","k":keyId,"w":wire} — тот же
        // формат, что в desktop и iOS. Ошибка (нет ключа собеседника,
        // отвечающая сторона пишет первой — NotInitialized) — null + честная
        // плашка: уйдёт обычный E2E-конверт, чат не ломается.
        fun ratchetPayload(
            chatId: String,
            uid: String,
            byUser: Map<String, ChatKey>,
            text: String): String? {
            val pair = CryptoService(uid).getOrCreateKeyPair()
            if (pair == null) {
                ratchetNote = "Ratchet: нет ключа устройства — отправлено обычным E2E-конвертом"
                return null
            }
            val peer = byUser.entries.filter { it.key != uid }.lastOrNull()?.value
            if (peer == null) {
                ratchetNote = "Ratchet: нет ключа собеседника — отправлено обычным E2E-конвертом"
                return null
            }
            return try {
                val state = ratchet.ensureSession(chatId, pair, peer)
                val wire = ratchet.encrypt(chatId, peer.keyId, text.toByteArray(Charsets.UTF_8), state)
                JSONObject()
                    .put("t", "r1")
                    .put("k", pair.keyId)
                    .put("w", Base64.encodeToString(wire, Base64.NO_WRAP))
                    .toString()
            } catch (e: Exception) {
                ratchetNote = "Ratchet: сессия не готова (собеседник ещё не писал) — отправлено обычным E2E-конвертом"
                null
            }
        }

        fun sendText(chat: ChatSummary, text: String) {
            val service = api ?: return
            val uid = userId ?: return
            if (text.isEmpty()) {
                return
            }
            busy = true
            status = null
            ratchetNote = null
            Thread {
                try {
                    val keys = service.chatKeys(chat.chatId)
                    val byUser = LinkedHashMap<String, ChatKey>()
                    for (key in keys) {
                        byUser[key.userId] = key
                    }
                    val participants = ArrayList<String>()
                    chat.doctorUserId?.let { participants.add(it) }
                    chat.patientUserId?.let { participants.add(it) }
                    participants.add(uid)
                    val ids = participants.distinct()
                    val chatE2E = ids.isNotEmpty() && ids.all { byUser[it] != null }
                    var outgoing = text
                    if (chatE2E && ratchetOn) {
                        val payload = ratchetPayload(chat.chatId, uid, byUser, text)
                        if (payload != null) {
                            outgoing = payload
                        }
                    }
                    if (chatE2E) {
                        val recipients = ids.mapNotNull { id ->
                            byUser[id]?.let { key -> id to key.publicKey }
                        }
                        val envelope = if (recipients.size == ids.size) {
                            CryptoService(uid).buildEnvelope(outgoing, recipients)
                        } else {
                            null
                        }
                        if (envelope != null) {
                            service.send(chat.chatId, "", envelope)
                        } else {
                            service.send(chat.chatId, text)
                        }
                    } else {
                        service.send(chat.chatId, text)
                    }
                    loadMessages(chat)
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

        fun openChatById(c: ChatSummary) {
            openChat = c
            ratchetOn = (SecureStore.get(ratchetFlagKey(c.chatId)) ?: "1") == "1"
            ratchetNote = null
            screen = "chat"
            loadMessages(c)
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

        Box {
        when (screen) {
            "connect" -> ConnectScreen(busy, status) { url ->
                val normalized = ApiService.normalize(url)
                loaderRun++
                loaderComplete = false
                loaderActive = true
                loaderNext = {
                    loaderActive = false
                    screen = "login"
                }
                busy = true
                status = null
                Thread {
                    val service = ApiService.connect(normalized)
                    try {
                        service.health()
                        SecureStore.set(normalized, KEY_SERVER)
                        api = service
                        loaderComplete = true
                    } catch (e: Exception) {
                        loaderActive = false
                        status = "Сервер недоступен: " + (e.message ?: "ошибка сети") +
                            ". Сервер на этом же телефоне? Введите http://127.0.0.1:8080. " +
                            "На другом? Подключитесь к его Wi-Fi точке доступа и нажмите «Шлюз Wi-Fi»"
                    }
                    busy = false
                }.start()
            }
            "login" -> LoginScreen(busy, status) { email, password ->
                val service = api ?: return@LoginScreen
                loaderRun++
                loaderComplete = false
                loaderActive = true
                loaderNext = {
                    loaderActive = false
                    screen = "chats"
                }
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
                        loaderComplete = true
                    } catch (e: Exception) {
                        loaderActive = false
                        status = e.message ?: "ошибка входа"
                    }
                    busy = false
                }.start()
            }
            "chats" -> ChatsScreen(chats, busy, status, onOpen = { chat ->
                openChatById(chat)
            })
            "chat" -> {
                val chat = openChat
                if (chat == null) {
                    ChatsScreen(chats, busy, status, onOpen = { c ->
                        openChatById(c)
                    })
                } else {
                    ChatScreen(
                        chat.title,
                        messages,
                        busy,
                        status,
                        ratchetOn,
                        ratchetNote,
                        olderRemaining > 0,
                        loadingOlder,
                        onLoadOlder = {
                            val oldest = messages.firstOrNull()?.time
                            if (oldest != null && !loadingOlder) {
                                loadMessages(chat, before = oldest)
                            }
                        },
                        onToggleRatchet = { value ->
                            ratchetOn = value
                            SecureStore.set(if (value) "1" else "0", ratchetFlagKey(chat.chatId))
                        },
                        onSend = { text -> sendText(chat, text) },
                        onBack = { openChat = null; screen = "chats" })
                }
            }
            }
            if (loaderActive) {
                BallLoaderOverlay(
                    runId = loaderRun,
                    complete = loaderComplete,
                    onProceed = { loaderNext?.invoke() })
            }
        }
    }
}

@Composable
private fun ConnectScreen(busy: Boolean, status: String?, onConnect: (String) -> Unit) {
    var url by remember { mutableStateOf(SecureStore.get(KEY_SERVER) ?: "http://10.0.2.2:3000") }
    var hint by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
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
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { url = "http://127.0.0.1:8080" }, enabled = !busy) {
                Text("Этот телефон")
            }
            OutlinedButton(
                onClick = {
                    val wm = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                    val gw = wm?.dhcpInfo?.gateway ?: 0
                    if (gw == 0) {
                        hint = "Wi-Fi не подключён: клиент должен быть в Wi-Fi точки доступа сервера, не в мобильном интернете"
                    } else {
                        url = "http://" + dhcpIp(gw) + ":8080"
                        hint = null
                    }
                },
                enabled = !busy) {
                Text("Шлюз Wi-Fi")
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onConnect(url) }, enabled = !busy) {
                Text(if (busy) "Подключение..." else "Подключиться")
            }
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
        }
        hint?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        Text(
            "Сервер на этом же телефоне: http://127.0.0.1:8080. Сервер на другом: " +
                "включите на нём точку доступа, подключитесь к ней по Wi-Fi и нажмите «Шлюз Wi-Fi» " +
                "(подставит адрес 192.168.x.x сервера). Адреса 10.x/100.x принадлежат мобильной " +
                "сети оператора и с другого телефона не работают.",
            style = MaterialTheme.typography.bodySmall)
        status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        LogsButton()
    }
}

// DhcpInfo.gateway: int little-endian, младший байт — первый октет.
private fun dhcpIp(gw: Int): String =
    (gw and 0xFF).toString() + "." + ((gw shr 8) and 0xFF) + "." +
        ((gw shr 16) and 0xFF) + "." + ((gw shr 24) and 0xFF)

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
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { onLogin(email, password) },
                enabled = !busy && email.isNotEmpty() && password.isNotEmpty()) {
                Text(if (busy) "Вход..." else "Войти")
            }
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
        }
        status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        LogsButton()
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
        LogsButton()
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
    ratchetEnabled: Boolean,
    ratchetNote: String?,
    canLoadOlder: Boolean,
    loadingOlder: Boolean,
    onLoadOlder: () -> Unit,
    onToggleRatchet: (Boolean) -> Unit,
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
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Switch(checked = ratchetEnabled, onCheckedChange = onToggleRatchet)
            Text("Double Ratchet (forward secrecy)", style = MaterialTheme.typography.bodySmall)
        }
        ratchetNote?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        if (canLoadOlder) {
            OutlinedButton(
                onClick = onLoadOlder,
                enabled = !busy && !loadingOlder,
                modifier = Modifier.fillMaxWidth()) {
                Text(if (loadingOlder) "Загрузка..." else "Загрузить более старые сообщения")
            }
        }
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(messages) { message ->
                Text(
                    (if (message.mine) "Вы" else "Собеседник") +
                        " · " + message.time +
                        (if (message.isRatchet) " · ratchet" else "") +
                        "\n" + message.text)
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
            "🔒 E2E при полном покрытии ключами + Double Ratchet (honest-fallback)",
            style = MaterialTheme.typography.bodySmall)
    }
}

// Кнопка «Логи»: диагностический журнал сети (ApiLog) с копированием
// одним нажатием, чтобы видеть, какой URL, статус и ошибка были при сбое.
@Composable
private fun LogsButton() {
    var show by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { show = true }) {
        Text("Логи")
    }
    if (show) {
        LogsDialog(onClose = { show = false })
    }
}

@Composable
private fun LogsDialog(onClose: () -> Unit) {
    val context = LocalContext.current
    val rows = remember { ApiLog.snapshot() }
    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = {
            TextButton(onClick = {
                val cm = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                    as android.content.ClipboardManager
                cm.setPrimaryClip(
                    android.content.ClipData.newPlainText("MedChat logs", rows.joinToString("\n")))
                android.widget.Toast.makeText(
                    context, "Логи скопированы", android.widget.Toast.LENGTH_SHORT).show()
                onClose()
            }) { Text("Скопировать") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Закрыть") } },
        title = { Text("Логи сети") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())) {
                if (rows.isEmpty()) {
                    Text("(пусто)", style = MaterialTheme.typography.bodySmall)
                }
                rows.forEach { line ->
                    Text(
                        line,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace)
                }
            }
        })
}
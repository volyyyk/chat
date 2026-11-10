package medchat.servermock

import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Лёгкая эмуляция MedChat API для смоук-тестов клиентов с телефона.
 *
 * Что эмулируется: вход/регистрация (любые данные), список чатов (2 демо),
 * история и отправка сообщений, бесплатное окно нового чата (24 часа,
 * как NEW_CHAT_FREE_HOURS на сервере), pricing, заглушки ключей E2E.
 *
 * Что НЕ эмулируется: БД, персистентность между запусками, реальная
 * E2E-криптография, платежи, файлы, OAuth-провайдеры.
 */
class MockServer(val port: Int, private val onLog: (String) -> Unit) : NanoHTTPD("0.0.0.0", port) {

    private val messages = ConcurrentHashMap<String, MutableList<JSONObject>>()
    private val freeUntil = ConcurrentHashMap<String, Long>()

    private val chats: List<JSONObject> = listOf(
        demoChat("chat-demo-1", "Иванов Алексей Борисович", "Терапевт", System.currentTimeMillis() - 2 * HOUR),
        demoChat("chat-demo-2", "Петрова Мария Сергеевна", "Кардиолог", System.currentTimeMillis() - 72 * HOUR)
    )

    init {
        // Один демо-чат в окне бесплатных сообщений, второй старше 24 часов.
        seedMessages("chat-demo-1")
        seedMessages("chat-demo-2")
    }

    private fun demoChat(id: String, doctor: String, specialty: String, createdAt: Long): JSONObject {
        freeUntil[id] = createdAt + FREE_WINDOW_MS
        return JSONObject()
            .put("id", id)
            .put("doctorName", doctor)
            .put("specialty", specialty)
            .put("status", "active")
            .put("createdAt", iso(createdAt))
            .put("lastMessageAt", iso(createdAt))
    }

    private fun seedMessages(chatId: String) {
        messages[chatId] = mutableListOf(
            msg(chatId, "doctor-mock", "Здравствуйте! Чем могу помочь?", System.currentTimeMillis() - HOUR)
        )
    }

    override fun serve(session: IHTTPSession): Response {
        val method = session.method
        val uri = session.uri ?: "/"
        onLog(method.name + " " + uri)
        if (method == Method.OPTIONS) {
            return cors(NanoHTTPD.newFixedLengthResponse(Response.Status.OK, MIME_JSON, "{}"))
        }
        return try {
            route(method, uri, session)
        } catch (e: Exception) {
            json(Response.Status.INTERNAL_ERROR, JSONObject()
                .put("success", false)
                .put("message", e.message ?: "internal error"))
        }
    }

    private fun route(method: Method, uri: String, session: IHTTPSession): Response {
        if (method == Method.GET && uri == "/") return htmlIndex()
        if (method == Method.GET && uri == "/health") {
            return jsonOk(JSONObject().put("status", "ok").put("mock", true))
        }

        val parts = uri.trim('/').split('/').filter { it.isNotEmpty() }

        // --- Auth: /api/auth/login | register | refresh | me ---
        if (parts.size >= 3 && parts[0] == "api" && parts[1] == "auth") {
            return when {
                method == Method.POST && (parts[2] == "login" || parts[2] == "register") -> authResponse()
                method == Method.POST && parts[2] == "refresh" -> authResponse()
                method == Method.GET && parts[2] == "me" -> jsonOk(mockUser())
                else -> notFound()
            }
        }

        // --- Chats: /api/chats и /api/chats/{id}/... ---
        if (parts.size >= 2 && parts[0] == "api" && parts[1] == "chats") {
            if (parts.size == 2) {
                return if (method == Method.GET) jsonOk(JSONArray(chats)) else notFound()
            }
            val chatId = parts[2]
            val chat = chats.firstOrNull { it.getString("id") == chatId }
            if (chat == null) return notFound()
            val sub = parts.getOrNull(3)
            return when {
                sub == null -> jsonOk(chat)
                method == Method.GET && sub == "messages" -> jsonOk(JSONArray(messagesFor(chatId)))
                method == Method.POST && sub == "messages" -> postMessage(chatId, session)
                method == Method.GET && sub == "check-free" -> checkFree(chatId)
                method == Method.GET && sub == "pricing" -> pricing(chatId)
                method == Method.POST && sub == "read" -> jsonOk(JSONObject().put("success", true))
                method == Method.GET && sub == "keys" -> jsonOk(JSONArray())
                else -> notFound()
            }
        }

        // --- Прочее ---
        if (uri == "/api/keys" && method == Method.POST) {
            return jsonOk(JSONObject().put("success", true))
        }

        return when (method) {
            Method.GET -> jsonOk(JSONArray())
            Method.POST -> jsonOk(JSONObject().put("echo", body(session)))
            else -> notFound()
        }
    }

    private fun authResponse(): Response {
        val user = mockUser()
        val inner = JSONObject()
            .put("user", user)
            .put("accessToken", "mock-access-token")
            .put("refreshToken", "mock-refresh-token")
            .put("expiresIn", "24h")
        val payload = JSONObject()
            .put("success", true)
            .put("data", inner)
            .put("user", user)
            .put("accessToken", "mock-access-token")
            .put("refreshToken", "mock-refresh-token")
            .put("expiresIn", "24h")
        return cors(NanoHTTPD.newFixedLengthResponse(Response.Status.OK, MIME_JSON, payload.toString()))
    }

    private fun mockUser(): JSONObject = JSONObject()
        .put("id", "user-mock-patient")
        .put("email", "patient@test.local")
        .put("role", "patient")
        .put("status", "active")
        .put("firstName", "Тест")
        .put("lastName", "Пациент")
        .put("phoneVerified", true)

    private fun messagesFor(chatId: String): List<JSONObject> {
        return messages[chatId]?.toList() ?: emptyList()
    }

    private fun postMessage(chatId: String, session: IHTTPSession): Response {
        val b = body(session)
        val content = b.optString("content", "").ifEmpty { b.optString("text", "(пусто)") }
        val m = msg(chatId, "user-mock-patient", content, System.currentTimeMillis())
        messages.getOrPut(chatId) { mutableListOf() }.add(m)
        val payload = JSONObject()
            .put("success", true)
            .put("data", m)
            .put("message", m)
        return cors(NanoHTTPD.newFixedLengthResponse(Response.Status.OK, MIME_JSON, payload.toString()))
    }

    private fun msg(chatId: String, senderId: String, content: String, createdAt: Long): JSONObject =
        JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("chatId", chatId)
            .put("senderId", senderId)
            .put("content", content)
            .put("type", "text")
            .put("createdAt", iso(createdAt))
            .put("isFree", true)

    private fun checkFree(chatId: String): Response {
        val until = freeUntil[chatId] ?: 0L
        val free = System.currentTimeMillis() < until
        val inner = JSONObject()
            .put("isFree", free)
            .put("reason", if (free) "new_chat_window" else "window_expired")
            .put("freeUntil", iso(until))
        return jsonOk(inner)
    }

    private fun pricing(chatId: String): Response {
        val until = freeUntil[chatId] ?: 0L
        val inner = JSONObject()
            .put("pricePerMessage", 0)
            .put("currency", "RUB")
            .put("newChatFreeHours", 24)
            .put("isFree", System.currentTimeMillis() < until)
            .put("freeUntil", iso(until))
        return jsonOk(inner)
    }

    private fun jsonOk(data: Any): Response {
        val payload = JSONObject().put("success", true).put("data", data)
        return cors(NanoHTTPD.newFixedLengthResponse(Response.Status.OK, MIME_JSON, payload.toString()))
    }

    private fun json(status: Response.Status, payload: JSONObject): Response {
        return cors(NanoHTTPD.newFixedLengthResponse(status, MIME_JSON, payload.toString()))
    }

    private fun notFound(): Response {
        return cors(NanoHTTPD.newFixedLengthResponse(
            Response.Status.NOT_FOUND, MIME_JSON,
            "{\"success\":false,\"message\":\"mock: not implemented\"}"))
    }

    private fun htmlIndex(): Response {
        val html = "<html><body><h1>MedChat mock server</h1>" +
            "<p>Эндпоинты: /health, /api/auth/login, /api/chats, " +
            "/api/chats/{id}/messages, /api/chats/{id}/check-free</p></body></html>"
        return cors(NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "text/html", html))
    }

    private fun cors(r: Response): Response {
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        r.addHeader("Access-Control-Allow-Headers", "Authorization, Content-Type")
        return r
    }

    private fun body(session: IHTTPSession): JSONObject = try {
        val map = HashMap<String, String>()
        session.parseBody(map)
        JSONObject(map["postData"] ?: "{}")
    } catch (_: Exception) {
        JSONObject()
    }

    companion object {
        private const val MIME_JSON = "application/json"
        private const val HOUR = 3600_000L
        private const val FREE_WINDOW_MS = 24 * HOUR // как NEW_CHAT_FREE_HOURS=24 на сервере
        private val ISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        private fun iso(ms: Long): String = ISO.format(Date(ms))
    }
}

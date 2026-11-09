// REST-клиент сервера MedChat (зеркало iOS ApiService.swift, контракты —
// readme_for_AI.md §5):
//   GET  /health
//   POST /api/auth/login → { user, accessToken }
//   GET  /api/auth/me → sanitizeUser
//   GET  /api/chats?limit=50 → { data: [ { id, chatId, title, ... } ] }
//   GET  /api/chats/:id/messages?limit=50 → { data: [Message] } (хронология)
//   POST /api/chats/:id/messages → 201 Message / 402 PAYMENT_REQUIRED
//   GET  /api/chats/:id/keys → { data: [ChatKey] } (активные ключи)
//   POST /api/keys { keyId, publicKey, algorithm, deviceName } (upsert)
// accessToken живёт 30 минут; refreshToken сознательно НЕ хранится:
// при протухании access пользователь входит заново. 401 от любой
// точки API сбрасывает токен и дёргает onUnauthorized (UI вернёт на
// экран входа). Чистый JVM (HttpURLConnection + org.json платформы
// Android), без androidx/Compose — поэтому typecheck сервиса возможен
// без Gradle. Этап 4 ч.3: файл живёт в Gradle-проекте (package
// medchat.android); UI-слой (Compose) — MedchatApp.kt, сборку UI
// гейтит джоба CI android-build.

package medchat.android

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiError(val status: Int, message: String) : Exception(message)

data class UserProfile(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val role: String) {
    val displayName: String
        get() {
            val name = (firstName + " " + lastName).trim()
            if (name.isNotEmpty()) {
                return if (role.isEmpty()) name else name + " · " + role
            }
            return if (role.isEmpty()) email else email + " · " + role
        }
}

data class ChatSummary(
    val id: String,
    val chatId: String,
    val title: String,
    val lastMessageText: String,
    val lastMessageAt: String,
    val doctorUserId: String?,
    val patientUserId: String?)

data class ChatMessage(
    val id: String,
    val content: String,
    val type: String,
    val senderId: String,
    val senderFirstName: String,
    val createdAt: String,
    val e2eEnvelope: JSONObject?)

data class ChatKey(
    val userId: String,
    val keyId: String,
    val publicKey: String,
    val algorithm: String,
    val deviceName: String)

class ApiService private constructor(val baseUrl: String) {

    var token: String? = null
    var onUnauthorized: (() -> Unit)? = null

    companion object {
        fun connect(rawUrl: String): ApiService = ApiService(normalize(rawUrl))

        fun normalize(raw: String): String {
            var value = raw.trim()
            while (value.endsWith("/")) {
                value = value.dropLast(1)
            }
            return value
        }

        // id в JSON может прийти строкой или числом — нормализуем в String.
        private fun anyId(value: Any?): String? = when (value) {
            null -> null
            is String -> value
            else -> value.toString()
        }
    }

    @Throws(ApiError::class)
    fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authorized: Boolean = true
    ): JSONObject {
        val connection = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.setRequestProperty("Content-Type", "application/json")
            if (authorized) {
                token?.let { connection.setRequestProperty("Authorization", "Bearer " + it) }
            }
            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { stream ->
                    stream.write(body.toString().toByteArray(Charsets.UTF_8))
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            val json = if (text.isNotEmpty()) {
                try {
                    JSONObject(text)
                } catch (e: Exception) {
                    JSONObject()
                }
            } else {
                JSONObject()
            }
            if (status !in 200..299) {
                if (authorized && status == 401 && token != null) {
                    token = null
                    onUnauthorized?.invoke()
                }
                val message = json.optString("message").ifEmpty { "HTTP " + status }
                throw ApiError(status, message)
            }
            return json
        } finally {
            connection.disconnect()
        }
    }

    fun health() {
        request("/health", authorized = false)
    }

    fun login(email: String, password: String): UserProfile {
        val body = JSONObject().put("email", email).put("password", password)
        val json = request("/api/auth/login", "POST", body, authorized = false)
        val accessToken = json.optString("accessToken")
        if (accessToken.isEmpty()) {
            throw ApiError(0, "сервер не вернул accessToken")
        }
        token = accessToken
        return parseUser(json.optJSONObject("user") ?: JSONObject())
    }

    fun me(): UserProfile = parseUser(request("/api/auth/me"))

    fun chats(limit: Int = 50): List<ChatSummary> {
        val rows = request("/api/chats?limit=" + limit).optJSONArray("data") ?: JSONArray()
        return (0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index)
            ChatSummary(
                id = anyId(row.opt("id")) ?: "",
                chatId = anyId(row.opt("chatId")) ?: anyId(row.opt("id")) ?: "",
                title = row.optString("title"),
                lastMessageText = row.optString("lastMessageText"),
                lastMessageAt = row.optString("lastMessageAt"),
                doctorUserId = participantId(row.opt("doctor")),
                patientUserId = participantId(row.opt("patient")))
        }
    }

    // Страница истории (длинные чаты): rows — хронология, total — сколько
    // сообщений под выборкой курсора before (или всего чата без курсора);
    // клиенту остаётся remaining = max(0, total - rows.size).
    class MessagesPage(val rows: List<ChatMessage>, val total: Int)

    fun messagesPage(chatId: String, limit: Int = 50, before: String? = null): MessagesPage {
        var path = "/api/chats/" + chatId + "/messages?limit=" + limit
        if (before != null) {
            path += "&before=" + java.net.URLEncoder.encode(before, "UTF-8")
        }
        val json = request(path)
        return (0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index)
            val metadata = row.optJSONObject("metadata") ?: JSONObject()
            val sender = row.optJSONObject("sender") ?: JSONObject()
            ChatMessage(
                id = anyId(row.opt("id")) ?: ("local-" + index),
                content = row.optString("content"),
                type = row.optString("type").ifEmpty { "text" },
                senderId = anyId(row.opt("senderId")) ?: "",
                senderFirstName = sender.optString("firstName"),
                createdAt = row.optString("createdAt"),
                e2eEnvelope = metadata.optJSONObject("e2e"))
        }
        val total = json.optJSONObject("pagination")?.optInt("total") ?: parsed.size
        return MessagesPage(parsed, total)
    }

    fun messages(chatId: String, limit: Int = 50): List<ChatMessage> = messagesPage(chatId, limit).rows

    // Отправка: при E2E content обязан быть пустым (шифр в envelope);
    // 402 PAYMENT_REQUIRED пробрасывается наверх как ApiError.
    fun send(chatId: String, content: String, envelope: E2EEnvelope? = null) {
        val body = JSONObject()
            .put("content", content)
            .put("type", "text")
            .put("clientType", "android")
        if (envelope != null) {
            body.put("envelope", envelope.json())
        }
        request("/api/chats/" + chatId + "/messages", "POST", body)
    }

    fun chatKeys(chatId: String): List<ChatKey> {
        val rows = request("/api/chats/" + chatId + "/keys")
            .optJSONArray("data") ?: JSONArray()
        return (0 until rows.length()).mapNotNull { index ->
            val row = rows.getJSONObject(index)
            val userId = anyId(row.opt("userId")) ?: return@mapNotNull null
            val keyId = row.optString("keyId")
            val publicKey = row.optString("publicKey")
            if (keyId.isEmpty() || publicKey.isEmpty()) {
                null
            } else {
                ChatKey(
                    userId = userId,
                    keyId = keyId,
                    publicKey = publicKey,
                    algorithm = row.optString("algorithm").ifEmpty { "x25519-box" },
                    deviceName = row.optString("deviceName"))
            }
        }
    }

    fun registerKey(keyId: String, publicKey: String) {
        request("/api/keys", "POST", JSONObject()
            .put("keyId", keyId)
            .put("publicKey", publicKey)
            .put("algorithm", "x25519-box")
            .put("deviceName", "android"))
    }

    private fun parseUser(row: JSONObject): UserProfile = UserProfile(
        id = anyId(row.opt("id")) ?: "",
        email = row.optString("email"),
        firstName = row.optString("firstName"),
        lastName = row.optString("lastName"),
        role = row.optString("role"))

    // Участник чата приходит как { userId } или { user: { id } } —
    // зеркально chatParticipants() desktop-клиента.
    private fun participantId(value: Any?): String? {
        val row = value as? JSONObject ?: return null
        anyId(row.opt("userId"))?.let { return it }
        return anyId((row.optJSONObject("user") ?: JSONObject()).opt("id"))
    }
}

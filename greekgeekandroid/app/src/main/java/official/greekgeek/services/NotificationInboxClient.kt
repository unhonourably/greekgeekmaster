package official.greekgeek.services

import official.greekgeek.design.ISODate
import official.greekgeek.models.AppNotification
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date
import java.util.concurrent.TimeUnit

class NotificationInboxClient(
    private val baseURL: String,
    private val anonKey: String,
    private val accessToken: String,
    private val userId: String
) {
    var onInsert: ((AppNotification) -> Unit)? = null

    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()

    private var ref = 0

    fun connect() {
        disconnect()
        val wsUrl = baseURL.replace("http://", "ws://").replace("https://", "wss://").trimEnd('/') +
                "/realtime/v1/websocket?apikey=$anonKey&vsn=1.0.0"

        val request = Request.Builder()
            .url(wsUrl)
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $accessToken")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val joinMsg = JSONObject().apply {
                    put("topic", "realtime:notifications")
                    put("event", "phx_join")
                    put("payload", JSONObject().apply {
                        put("config", JSONObject().apply {
                            put("broadcast", JSONObject().put("ack", false).put("self", false))
                            put("presence", JSONObject().put("key", ""))
                            put("postgres_changes", JSONArray().put(JSONObject().apply {
                                put("event", "INSERT")
                                put("schema", "public")
                                put("table", "notifications")
                                put("filter", "user_id=eq.$userId")
                            }))
                        })
                        put("access_token", accessToken)
                    })
                    put("ref", "${++ref}")
                }
                webSocket.send(joinMsg.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    val event = json.optString("event")
                    if (event == "postgres_changes" || event == "INSERT") {
                        val payload = json.optJSONObject("payload") ?: return
                        val data = payload.optJSONObject("data") ?: payload
                        val record = data.optJSONObject("record") ?: data
                        val id = record.optString("id")
                        if (id.isNotBlank()) {
                            val notif = AppNotification(
                                id = id,
                                kind = record.optString("kind", "notification"),
                                title = record.optString("title", "GreekGeek"),
                                body = record.optString("body", ""),
                                createdAt = record.optString("created_at").takeIf { it.isNotBlank() }?.let { ISODate.parse(it) } ?: Date(),
                                readAt = record.optString("read_at").takeIf { it.isNotBlank() }?.let { ISODate.parse(it) }
                            )
                            onInsert?.invoke(notif)
                        }
                    }
                } catch (_: Exception) {}
            }
        })
    }

    fun disconnect() {
        try {
            webSocket?.close(1000, "Leaving")
        } catch (_: Exception) {}
        webSocket = null
    }
}

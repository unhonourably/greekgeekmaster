package official.greekgeek.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val email: String,
    val expiresAt: Long
) {
    val isExpired: Boolean get() = System.currentTimeMillis() >= (expiresAt - 60_000)
}

class SupabaseException(message: String) : Exception(message)

class SupabaseClient(
    val baseURL: String = AppConfig.SUPABASE_URL,
    val anonKey: String = AppConfig.SUPABASE_ANON_KEY
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    suspend fun signIn(email: String, password: String): AuthSession = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("email", email.trim())
            put("password", password)
        }
        val request = Request.Builder()
            .url("$baseURL/auth/v1/token?grant_type=password")
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(payload.toString().toRequestBody(jsonMedia))
            .build()

        executeAuth(request)
    }

    suspend fun signUp(email: String, password: String, fullName: String): AuthSession? = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("email", email.trim())
            put("password", password)
            put("data", JSONObject().apply { put("full_name", fullName.trim()) })
        }
        val request = Request.Builder()
            .url("$baseURL/auth/v1/signup")
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(payload.toString().toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val json = try { JSONObject(body) } catch (_: Exception) { null }
                val errorMsg = json?.optString("msg")?.ifEmpty { null }
                    ?: json?.optString("error_description")?.ifEmpty { null }
                    ?: json?.optString("message")?.ifEmpty { null }
                    ?: "Sign up failed (${response.code})"
                throw SupabaseException(errorMsg)
            }
            val json = JSONObject(body)
            val accessToken = json.optString("access_token")
            if (accessToken.isNotEmpty()) {
                val refreshToken = json.optString("refresh_token")
                val user = json.getJSONObject("user")
                val userId = user.getString("id")
                val userEmail = user.optString("email", email)
                val expiresIn = json.optLong("expires_in", 3600)
                AuthSession(
                    accessToken = accessToken,
                    refreshToken = refreshToken,
                    userId = userId,
                    email = userEmail,
                    expiresAt = System.currentTimeMillis() + expiresIn * 1000
                )
            } else {
                null
            }
        }
    }

    suspend fun refresh(session: AuthSession): AuthSession = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("refresh_token", session.refreshToken)
        }
        val request = Request.Builder()
            .url("$baseURL/auth/v1/token?grant_type=refresh_token")
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(payload.toString().toRequestBody(jsonMedia))
            .build()

        executeAuth(request)
    }

    suspend fun requestPasswordReset(email: String): Unit = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply { put("email", email.trim()) }
        val request = Request.Builder()
            .url("$baseURL/auth/v1/recover")
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .post(payload.toString().toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val body = response.body?.string() ?: ""
                val json = try { JSONObject(body) } catch (_: Exception) { null }
                val errorMsg = json?.optString("msg") ?: json?.optString("message") ?: "Password reset request failed (${response.code})"
                throw SupabaseException(errorMsg)
            }
        }
    }

    suspend fun updatePassword(accessToken: String, password: String): Unit = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply { put("password", password) }
        val request = Request.Builder()
            .url("$baseURL/auth/v1/user")
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Content-Type", "application/json")
            .put(payload.toString().toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val body = response.body?.string() ?: ""
                val json = try { JSONObject(body) } catch (_: Exception) { null }
                val errorMsg = json?.optString("msg") ?: json?.optString("message") ?: "Update password failed (${response.code})"
                throw SupabaseException(errorMsg)
            }
        }
    }

    suspend fun signOut(accessToken: String): Unit = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseURL/auth/v1/logout")
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .post("{}".toRequestBody(jsonMedia))
            .build()

        try {
            client.newCall(request).execute().close()
        } catch (_: Exception) {}
    }

    // ==========================================
    // PostgREST REST Queries & RPCs
    // ==========================================

    suspend fun select(
        table: String,
        query: String,
        accessToken: String
    ): JSONArray = withContext(Dispatchers.IO) {
        val cleanBase = baseURL.trimEnd('/')
        val url = "$cleanBase/rest/v1/$table?$query"
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Accept", "application/json")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val msg = parseErrorMessage(body, "Query failed on $table (${response.code})")
                throw SupabaseException(msg)
            }
            if (body.isBlank() || body == "null") return@withContext JSONArray()
            try {
                JSONArray(body)
            } catch (e: Exception) {
                try {
                    val single = JSONObject(body)
                    JSONArray().put(single)
                } catch (_: Exception) {
                    JSONArray()
                }
            }
        }
    }

    suspend fun selectPages(
        table: String,
        query: String,
        accessToken: String,
        pageSize: Int = 1000
    ): JSONArray = withContext(Dispatchers.IO) {
        val result = JSONArray()
        val cleanBase = baseURL.trimEnd('/')
        val url = "$cleanBase/rest/v1/$table?$query"

        for (from in 0 until (100 * pageSize) step pageSize) {
            val to = from + pageSize - 1
            val request = Request.Builder()
                .url(url)
                .header("apikey", anonKey)
                .header("Authorization", "Bearer $accessToken")
                .header("Accept", "application/json")
                .header("Range", "$from-$to")
                .get()
                .build()

            val chunk = try {
                client.newCall(request).execute().use { response ->
                    val body = response.body?.string() ?: ""
                    if (!response.isSuccessful || body.isBlank() || body == "null") {
                        JSONArray()
                    } else {
                        try { JSONArray(body) } catch (_: Exception) { JSONArray() }
                    }
                }
            } catch (_: Exception) {
                break
            }

            for (i in 0 until chunk.length()) {
                val obj = chunk.optJSONObject(i)
                if (obj != null) {
                    result.put(obj)
                }
            }
            if (chunk.length() < pageSize) {
                break
            }
        }
        result
    }

    suspend fun count(
        table: String,
        query: String,
        accessToken: String
    ): Int = withContext(Dispatchers.IO) {
        try {
            val cleanBase = baseURL.trimEnd('/')
            val url = "$cleanBase/rest/v1/$table?$query"
            val request = Request.Builder()
                .url(url)
                .header("apikey", anonKey)
                .header("Authorization", "Bearer $accessToken")
                .header("Accept", "application/json")
                .header("Prefer", "count=exact")
                .header("Range", "0-0")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val header = response.header("Content-Range") ?: ""
                val totalStr = header.substringAfterLast('/', "")
                totalStr.trim().toIntOrNull() ?: 0
            }
        } catch (_: Exception) {
            0
        }
    }

    suspend fun rpc(
        name: String,
        parameters: JSONObject = JSONObject(),
        accessToken: String
    ): Any? = withContext(Dispatchers.IO) {
        val cleanBase = baseURL.trimEnd('/')
        val url = "$cleanBase/rest/v1/rpc/$name"
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .post(parameters.toString().toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val msg = parseErrorMessage(body, "RPC $name failed (${response.code})")
                throw SupabaseException(msg)
            }
            if (body.isBlank() || body == "null") return@withContext null
            val trimmed = body.trim()
            if (trimmed.startsWith("[")) {
                return@withContext try { JSONArray(trimmed) } catch (_: Exception) { null }
            }
            if (trimmed.startsWith("{")) {
                return@withContext try { JSONObject(trimmed) } catch (_: Exception) { null }
            }
            // Primitive (boolean, number, or string)
            if (trimmed == "true") return@withContext true
            if (trimmed == "false") return@withContext false
            val asLong = trimmed.toLongOrNull()
            if (asLong != null) return@withContext asLong
            val asDouble = trimmed.toDoubleOrNull()
            if (asDouble != null) return@withContext asDouble
            return@withContext trimmed.removeSurrounding("\"")
        }
    }

    suspend fun insert(
        table: String,
        body: Any, // JSONObject or JSONArray
        accessToken: String,
        returnRepresentation: Boolean = false
    ): String? = withContext(Dispatchers.IO) {
        val cleanBase = baseURL.trimEnd('/')
        val url = "$cleanBase/rest/v1/$table"
        val reqBuilder = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("Prefer", if (returnRepresentation) "return=representation" else "return=minimal")
            .post(body.toString().toRequestBody(jsonMedia))

        client.newCall(reqBuilder.build()).execute().use { response ->
            val respBody = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val msg = parseErrorMessage(respBody, "Insert into $table failed (${response.code})")
                throw SupabaseException(msg)
            }
            return@withContext if (returnRepresentation) respBody else null
        }
    }

    suspend fun patch(
        table: String,
        query: String,
        body: JSONObject,
        accessToken: String
    ): Unit = withContext(Dispatchers.IO) {
        val cleanBase = baseURL.trimEnd('/')
        val url = "$cleanBase/rest/v1/$table?$query"
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .patch(body.toString().toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val respBody = response.body?.string() ?: ""
                val msg = parseErrorMessage(respBody, "Update on $table failed (${response.code})")
                throw SupabaseException(msg)
            }
        }
    }

    suspend fun delete(
        table: String,
        query: String,
        accessToken: String
    ): Unit = withContext(Dispatchers.IO) {
        val cleanBase = baseURL.trimEnd('/')
        val url = "$cleanBase/rest/v1/$table?$query"
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Prefer", "return=minimal")
            .delete()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val respBody = response.body?.string() ?: ""
                val msg = parseErrorMessage(respBody, "Delete on $table failed (${response.code})")
                throw SupabaseException(msg)
            }
        }
    }

    suspend fun upsert(
        table: String,
        onConflict: String,
        body: Any,
        accessToken: String
    ): Unit = withContext(Dispatchers.IO) {
        val cleanBase = baseURL.trimEnd('/')
        val url = "$cleanBase/rest/v1/$table?on_conflict=$onConflict"
        val request = Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Authorization", "Bearer $accessToken")
            .header("Content-Type", "application/json")
            .header("Prefer", "resolution=merge-duplicates,return=minimal")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val respBody = response.body?.string() ?: ""
                val msg = parseErrorMessage(respBody, "Upsert on $table failed (${response.code})")
                throw SupabaseException(msg)
            }
        }
    }

    private fun parseErrorMessage(body: String, fallback: String): String {
        return try {
            val json = JSONObject(body)
            json.optString("message").ifEmpty { null }
                ?: json.optString("msg").ifEmpty { null }
                ?: json.optString("error_description").ifEmpty { null }
                ?: json.optString("hint").ifEmpty { null }
                ?: fallback
        } catch (_: Exception) {
            if (body.isNotBlank() && body.length < 300) body.trim() else fallback
        }
    }

    private fun executeAuth(request: Request): AuthSession {
        client.newCall(request).execute().use { response ->
            val body = response.body?.string() ?: ""
            if (!response.isSuccessful) {
                val json = try { JSONObject(body) } catch (_: Exception) { null }
                val errorMsg = json?.optString("error_description")?.ifEmpty { null }
                    ?: json?.optString("msg")?.ifEmpty { null }
                    ?: json?.optString("message")?.ifEmpty { null }
                    ?: "Authentication error (${response.code})"
                throw SupabaseException(errorMsg)
            }
            val json = JSONObject(body)
            val accessToken = json.getString("access_token")
            val refreshToken = json.getString("refresh_token")
            val user = json.getJSONObject("user")
            val userId = user.getString("id")
            val email = user.optString("email")
            val expiresIn = json.optLong("expires_in", 3600)
            return AuthSession(
                accessToken = accessToken,
                refreshToken = refreshToken,
                userId = userId,
                email = email,
                expiresAt = System.currentTimeMillis() + expiresIn * 1000
            )
        }
    }
}

package es.manico.chartintelligence.data.repository

import android.content.Context
import android.net.Uri
import es.manico.chartintelligence.config.AppConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * INF-01: Encrypted Workspace Backup & Restore Helper (PBKDF2-HMAC-SHA256 + AES-256-GCM).
 * Uses zero-permission Android SAF Uri streams and never persists user passphrases.
 */
class BackupExportHelper(
    private val context: Context,
    private val httpClient: OkHttpClient,
    private val repository: WorkspaceRepository
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun exportEncryptedBackupToUri(uri: Uri, passphrase: String): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                require(passphrase.length >= 8) { "Passphrase must be at least 8 characters" }
                // Try server-side backup endpoint first so MariaDB metadata & quality reports are included
                val serverPayload = tryServerExport(passphrase)
                val finalJson = if (serverPayload != null) {
                    serverPayload
                } else {
                    buildLocalEncryptedBackup(passphrase)
                }
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    out.write(finalJson.toByteArray(Charsets.UTF_8))
                } ?: error("Cannot open destination document")
                "AES-256-GCM"
            }
        }

    suspend fun restoreEncryptedBackupFromUri(uri: Uri, passphrase: String): Result<JSONObject> =
        withContext(Dispatchers.IO) {
            runCatching {
                require(passphrase.length >= 8) { "Passphrase must be at least 8 characters" }
                val rawText = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use {
                    it.readText()
                } ?: error("Cannot read backup document")
                val backupObj = JSONObject(rawText)
                require(backupObj.optString("format") == "ci_encrypted_backup_v1") {
                    "Unsupported backup format"
                }

                // Prefer server restore endpoint when online + authenticated, else decrypt locally
                val restoredWs = tryServerRestore(backupObj, passphrase)
                    ?: decryptAndVerifyLocally(backupObj, passphrase)
                repository.applyCloudWorkspaceToLocal(restoredWs)
                restoredWs
            }
        }

    private fun tryServerExport(passphrase: String): String? {
        val token = repository.getSessionToken()
        val bodyObj = JSONObject().apply {
            put("action", "export")
            put("passphrase", passphrase)
            if (token.isNotBlank()) put("session_token", token)
        }
        val reqBuilder = Request.Builder()
            .url("${AppConfig.API_BASE_URL}backup.php?action=export")
            .post(bodyObj.toString().toRequestBody(jsonMediaType))
        if (token.isNotBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }
        return runCatching {
            httpClient.newCall(reqBuilder.build()).execute().use { resp ->
                if (!resp.isSuccessful) return@use null
                val root = JSONObject(resp.body?.string().orEmpty())
                if (root.optBoolean("ok", false)) root.optJSONObject("data")?.toString(2) else null
            }
        }.getOrNull()
    }

    private fun tryServerRestore(backupObj: JSONObject, passphrase: String): JSONObject? {
        val token = repository.getSessionToken()
        val bodyObj = JSONObject().apply {
            put("action", "restore")
            put("passphrase", passphrase)
            put("backup", backupObj)
            if (token.isNotBlank()) put("session_token", token)
        }
        val reqBuilder = Request.Builder()
            .url("${AppConfig.API_BASE_URL}backup.php?action=restore")
            .post(bodyObj.toString().toRequestBody(jsonMediaType))
        if (token.isNotBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }
        return runCatching {
            httpClient.newCall(reqBuilder.build()).execute().use { resp ->
                if (!resp.isSuccessful) return@use null
                val root = JSONObject(resp.body?.string().orEmpty())
                if (root.optBoolean("ok", false)) {
                    root.optJSONObject("data")?.optJSONObject("workspace")
                } else null
            }
        }.getOrNull()
    }

    private fun buildLocalEncryptedBackup(passphrase: String): String {
        val symbols = repository.loadSymbolCatalog()
        val prefs = repository.loadChartPreferences()
        val tabs = repository.loadSavedOpenTabs()
        val drawings = repository.getAllCachedDrawings(symbols.map { it.chartId })
        val wsObj = repository.buildWorkspaceJson(symbols, prefs, drawings, tabs)
        val snapshot = JSONObject().apply {
            put("format", "ci_encrypted_backup_v1")
            put("exported_at_utc", java.time.Instant.now().toString())
            put("owner", JSONObject().apply { put("username", repository.getOwnerUsername().ifBlank { "owner" }) })
            put("workspace", wsObj)
        }.toString()

        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val iterations = 100_000
        val keyBytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            .generateSecret(PBEKeySpec(passphrase.toCharArray(), salt, iterations, 256))
            .encoded
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(keyBytes, "AES"), GCMParameterSpec(128, iv))
        val sealed = cipher.doFinal(snapshot.toByteArray(Charsets.UTF_8))
        val ciphertext = sealed.copyOfRange(0, sealed.size - 16)
        val tag = sealed.copyOfRange(sealed.size - 16, sealed.size)
        val checksum = MessageDigest.getInstance("SHA-256")
            .digest(snapshot.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

        return JSONObject().apply {
            put("format", "ci_encrypted_backup_v1")
            put("cipher", "AES-256-GCM")
            put("kdf", "PBKDF2-HMAC-SHA256")
            put("iterations", iterations)
            put("salt_b64", android.util.Base64.encodeToString(salt, android.util.Base64.NO_WRAP))
            put("iv_b64", android.util.Base64.encodeToString(iv, android.util.Base64.NO_WRAP))
            put("tag_b64", android.util.Base64.encodeToString(tag, android.util.Base64.NO_WRAP))
            put("checksum_sha256", checksum)
            put("ciphertext_b64", android.util.Base64.encodeToString(ciphertext, android.util.Base64.NO_WRAP))
            put("exported_at_utc", java.time.Instant.now().toString())
        }.toString(2)
    }

    private fun decryptAndVerifyLocally(backupObj: JSONObject, passphrase: String): JSONObject {
        val iterations = backupObj.optInt("iterations", 100_000).coerceIn(10_000, 500_000)
        val salt = android.util.Base64.decode(backupObj.getString("salt_b64"), android.util.Base64.DEFAULT)
        val iv = android.util.Base64.decode(backupObj.getString("iv_b64"), android.util.Base64.DEFAULT)
        val tag = android.util.Base64.decode(backupObj.getString("tag_b64"), android.util.Base64.DEFAULT)
        val ciphertext = android.util.Base64.decode(backupObj.getString("ciphertext_b64"), android.util.Base64.DEFAULT)
        val combined = ciphertext + tag
        val keyBytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            .generateSecret(PBEKeySpec(passphrase.toCharArray(), salt, iterations, 256))
            .encoded
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(keyBytes, "AES"), GCMParameterSpec(128, iv))
        val plainBytes = cipher.doFinal(combined)
        val expectedChecksum = backupObj.optString("checksum_sha256", "").lowercase()
        if (expectedChecksum.isNotEmpty()) {
            val actualChecksum = MessageDigest.getInstance("SHA-256")
                .digest(plainBytes)
                .joinToString("") { "%02x".format(it) }
            require(actualChecksum == expectedChecksum) { "Backup SHA-256 checksum mismatch" }
        }
        val snapshot = JSONObject(String(plainBytes, Charsets.UTF_8))
        return snapshot.getJSONObject("workspace")
    }
}

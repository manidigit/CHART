package es.manico.chartintelligence.algorithms

import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Independent Algorithm Library Module:
 * Handles PBKDF2-HMAC-SHA256 password hashing and constant-time verification
 * for the owner's personal account.
 */
object PasswordHashAlgorithm {

    private const val ITERATIONS = 12_000
    private const val KEY_LENGTH_BITS = 256
    private const val ALGORITHM = "PBKDF2WithHmacSHA256"

    fun generateSaltBase64(): String {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)
        return Base64.getEncoder().encodeToString(salt)
    }

    fun hashPassword(password: String, saltBase64: String): String {
        val salt = Base64.getDecoder().decode(saltBase64)
        val spec = PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH_BITS)
        val factory = SecretKeyFactory.getInstance(ALGORITHM)
        val hash = factory.generateSecret(spec).encoded
        return Base64.getEncoder().encodeToString(hash)
    }

    fun verifyPassword(password: String, saltBase64: String, expectedHashBase64: String): Boolean {
        if (saltBase64.isBlank() || expectedHashBase64.isBlank()) return false
        val actualHash = hashPassword(password, saltBase64)
        return constantTimeEquals(actualHash, expectedHashBase64)
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        val aBytes = a.toByteArray(Charsets.UTF_8)
        val bBytes = b.toByteArray(Charsets.UTF_8)
        if (aBytes.size != bBytes.size) return false
        var diff = 0
        for (i in aBytes.indices) {
            diff = diff or (aBytes[i].toInt() xor bBytes[i].toInt())
        }
        return diff == 0
    }
}

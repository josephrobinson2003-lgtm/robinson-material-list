package com.robinsonelectrical.geofence

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Token storage for a future Microsoft sign-in. Unverified on a device. */
object SecureTokenStore {
    private const val FILE = "re_secure_tokens"

    fun save(context: Context, account: String, token: String): Boolean {
        val prefs = open(context) ?: return false
        prefs.edit().putString(account, token).apply()
        return true
    }

    fun load(context: Context, account: String): String? {
        val prefs = open(context) ?: return null
        return prefs.getString(account, null)
    }

    private fun open(context: Context): android.content.SharedPreferences? {
        return try {
            val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            EncryptedSharedPreferences.create(
                context,
                FILE,
                key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (error: Exception) {
            null
        }
    }
}

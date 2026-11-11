package com.robinsonelectrical.geofence

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import org.json.JSONArray

@CapacitorPlugin(name = "RobinsonGeofence")
class RobinsonGeofencePlugin : Plugin() {
    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val result = JSObject()
        result.put("platform", "android")
        result.put("backgroundGeofence", true)
        result.put("implementation", "play-services-geofencing")
        result.put("coordinatesPersisted", false)
        result.put("secureStorage", true)
        result.put("deviceTested", false)
        call.resolve(result)
    }

    @PluginMethod
    fun armForToday(call: PluginCall) {
        if (!fineLocationGranted()) {
            call.reject("location-denied")
            return
        }
        val dutyDate = call.getString("dutyDate")
        val regions = call.getArray("regions")
        if (dutyDate.isNullOrBlank() || regions == null) {
            call.reject("not-configured")
            return
        }
        val fences = ArrayList<Geofence>()
        for (i in 0 until regions.length()) {
            val region = regions.getJSONObject(i)
            val radius = region.getDouble("radiusMeters").coerceAtLeast(150.0).toFloat()
            fences.add(
                Geofence.Builder()
                    .setRequestId(region.getString("jobId"))
                    .setCircularRegion(region.getDouble("latitude"), region.getDouble("longitude"), radius)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .build()
            )
        }
        val request = GeofencingRequest.Builder()
            .setInitialTrigger(0)
            .addGeofences(fences)
            .build()
        LocationServices.getGeofencingClient(context).addGeofences(request, pendingIntent())
        getContext().getSharedPreferences(GeofenceBroadcastReceiver.PREFS, android.content.Context.MODE_PRIVATE)
            .edit().putString(GeofenceBroadcastReceiver.ARMED_DATE, dutyDate).apply()
        ContextCompat.startForegroundService(context, Intent(context, TrackingForegroundService::class.java))
        val status = JSObject()
        status.put("armed", true)
        status.put("coordinatesPersisted", false)
        call.resolve(status)
    }

    @PluginMethod
    fun disarm(call: PluginCall) {
        LocationServices.getGeofencingClient(context).removeGeofences(pendingIntent())
        getContext().getSharedPreferences(GeofenceBroadcastReceiver.PREFS, android.content.Context.MODE_PRIVATE)
            .edit().remove(GeofenceBroadcastReceiver.ARMED_DATE).apply()
        context.stopService(Intent(context, TrackingForegroundService::class.java))
        val status = JSObject()
        status.put("armed", false)
        call.resolve(status)
    }

    @PluginMethod
    fun getPendingEvents(call: PluginCall) {
        val raw = getContext().getSharedPreferences(GeofenceBroadcastReceiver.PREFS, android.content.Context.MODE_PRIVATE)
            .getString(GeofenceBroadcastReceiver.QUEUE, "[]")
        val result = JSObject()
        result.put("events", JSArray(JSONArray(raw).toString()))
        call.resolve(result)
    }

    @PluginMethod
    fun ackEvents(call: PluginCall) {
        getContext().getSharedPreferences(GeofenceBroadcastReceiver.PREFS, android.content.Context.MODE_PRIVATE)
            .edit().putString(GeofenceBroadcastReceiver.QUEUE, "[]").apply()
        call.resolve()
    }

    @PluginMethod
    fun saveToken(call: PluginCall) {
        val token = call.getString("token")
        if (token.isNullOrBlank()) {
            call.reject("missing-token")
            return
        }
        val saved = SecureTokenStore.save(context, "microsoft", token)
        if (!saved) call.reject("secure-storage-unavailable") else call.resolve()
    }

    private fun fineLocationGranted(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun pendingIntent(): PendingIntent {
        val intent = Intent(context, GeofenceBroadcastReceiver::class.java)
        return PendingIntent.getBroadcast(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
    }
}

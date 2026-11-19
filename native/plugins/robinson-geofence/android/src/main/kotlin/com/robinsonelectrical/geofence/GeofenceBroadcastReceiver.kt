package com.robinsonelectrical.geofence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone
import java.util.UUID

/** Stores a job id and time. Does not store coordinates or a route. */
class GeofenceBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val armedDate = prefs.getString(ARMED_DATE, null) ?: return
        val today = chicagoDate()
        if (armedDate != today) {
            prefs.edit().remove(ARMED_DATE).apply()
            return
        }
        val transition = when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
            else -> return
        }
        val accuracy = event.triggeringLocation?.accuracy?.toDouble()
        val queue = JSONArray(prefs.getString(QUEUE, "[]"))
        for (fence in event.triggeringGeofences.orEmpty()) {
            val item = JSONObject()
            item.put("nativeEventId", UUID.randomUUID().toString())
            item.put("jobId", fence.requestId)
            item.put("transition", transition)
            item.put("occurredAt", System.currentTimeMillis())
            if (accuracy != null) item.put("accuracyMeters", accuracy)
            queue.put(item)
        }
        prefs.edit().putString(QUEUE, queue.toString()).apply()
    }

    companion object {
        const val PREFS = "re_geofence_events"
        const val QUEUE = "queue"
        const val ARMED_DATE = "armedDutyDate"

        fun chicagoDate(): String {
            val calendar = Calendar.getInstance(TimeZone.getTimeZone("America/Chicago"))
            return "%04d-%02d-%02d".format(
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH) + 1,
                calendar.get(Calendar.DAY_OF_MONTH)
            )
        }
    }
}

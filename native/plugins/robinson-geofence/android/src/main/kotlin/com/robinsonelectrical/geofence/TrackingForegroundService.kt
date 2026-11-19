package com.robinsonelectrical.geofence

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** Visible notice while job-site suggestions are armed. Stops when disarmed. */
class TrackingForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(CHANNEL, "Job-site suggestions", NotificationManager.IMPORTANCE_LOW)
        manager.createNotificationChannel(channel)
        val stop = PendingIntent.getService(
            this, 1, Intent(this, TrackingForegroundService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Robinson Electrical is watching saved jobs for today")
            .setContentText("Suggestions are not hours. Tap to turn this off.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .addAction(0, "Turn off", stop)
            .setOngoing(true)
            .build()
        startForeground(NOTIFICATION_ID, notification)
        return START_NOT_STICKY
    }

    companion object {
        const val CHANNEL = "re_tracking"
        const val ACTION_STOP = "com.robinsonelectrical.geofence.STOP"
        const val NOTIFICATION_ID = 4101
    }
}

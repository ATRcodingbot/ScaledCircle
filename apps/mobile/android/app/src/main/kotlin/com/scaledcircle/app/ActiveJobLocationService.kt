package com.scaledcircle.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import java.util.concurrent.atomic.AtomicBoolean

class ActiveJobLocationService : Service() {
    private lateinit var fused: FusedLocationProviderClient
    private lateinit var store: TrackingStore
    private val receiving = AtomicBoolean(false)
    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.sortedBy { it.time }.forEach { store.append(it) }
        }
    }

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        store = TrackingStore(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!store.isActive()) { stopSelf(); return START_NOT_STICKY }
        startForeground(NOTIFICATION_ID, buildNotification())
        requestUpdates()
        return START_STICKY
    }

    private fun requestUpdates() {
        if (receiving.getAndSet(true)) return
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            receiving.set(false); store.stop("permission_revoked"); stopSelf(); return
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 20_000L)
            .setMinUpdateIntervalMillis(12_000L)
            .setMinUpdateDistanceMeters(12f)
            .setMaxUpdateDelayMillis(60_000L)
            .setWaitForAccurateLocation(false)
            .build()
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    override fun onDestroy() {
        if (::fused.isInitialized) fused.removeLocationUpdates(callback)
        receiving.set(false)
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "Active job GPS", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Visible only while a Scaled Circle job is actively tracking"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(applicationInfo.icon)
        .setContentTitle("Job in progress — GPS tracking active")
        .setContentText("Tracking ${store.zoneName()}. Open Scaled Circle to view or complete the job.")
        .setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setContentIntent(PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        .build()

    companion object {
        private const val CHANNEL_ID = "scaled_circle_active_job"
        private const val NOTIFICATION_ID = 4107
        fun stop(context: Context) { context.stopService(Intent(context, ActiveJobLocationService::class.java)) }
        fun capture(context: Context, flags: List<String> = emptyList(), callback: (Map<String, Any?>?) -> Unit) {
            if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { callback(null); return }
            val client = LocationServices.getFusedLocationProviderClient(context)
            client.getCurrentLocation(CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_HIGH_ACCURACY).setDurationMillis(15_000L).setMaxUpdateAgeMillis(5_000L).build(), null)
                .addOnSuccessListener { location -> callback(location?.let { TrackingStore(context).append(it, flags) }) }
                .addOnFailureListener { callback(null) }
        }
    }
}

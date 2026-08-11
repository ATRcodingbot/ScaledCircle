package com.scaledcircle.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class ActiveJobTrackingBridge(private val activity: Activity, messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, "com.scaledcircle/active_job_tracking")
    private val store = TrackingStore(activity)
    fun register() = channel.setMethodCallHandler(this)

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getState" -> result.success(store.state())
            "start" -> start(call, result)
            "pendingChunks" -> result.success(store.chunks(call.argument<Int>("maximumPoints") ?: 50))
            "acknowledgeChunk" -> { store.acknowledge(call.argument<Int>("endSequence") ?: 0); result.success(null) }
            "purgeAcknowledgedEvidence" -> result.success(
                store.purgeAcknowledgedEvidence(call.argument<String>("sessionId") ?: "")
            )
            "captureCheckpointLocation" -> ActiveJobLocationService.capture(activity, listOf("checkpoint")) { result.success(it) }
            "stop" -> {
                val reason = call.argument<String>("reason") ?: "stopped"
                if (call.argument<Boolean>("captureFinalPoint") == true) {
                    ActiveJobLocationService.capture(activity, listOf("final_point")) { store.stop(reason); ActiveJobLocationService.stop(activity); result.success(null) }
                } else { store.stop(reason); ActiveJobLocationService.stop(activity); result.success(null) }
            }
            else -> result.notImplemented()
        }
    }

    private fun start(call: MethodCall, result: MethodChannel.Result) {
        if (ActivityCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { result.error("permission_denied", "Precise location permission is required during an active job.", null); return }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && ActivityCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7301)
            result.error("notification_permission_required", "Allow notifications, then press Start Job again so Android can display the active GPS notice.", null)
            return
        }
        val manager = activity.getSystemService(LocationManager::class.java)
        if (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER) && !manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) { result.error("location_disabled", "Turn on Location Services before starting this job.", null); return }
        if (store.isActive()) { result.error("already_active", "A tracking session is already active.", null); return }
        val fields = listOf("sessionId", "campaignId", "zoneId", "scalerId", "zoneName")
        val config = fields.associateWith { call.argument<String>(it) ?: "" }
        if (config.values.any { it.isBlank() }) { result.error("invalid_config", "Tracking session configuration is incomplete.", null); return }
        store.start(config)
        ContextCompat.startForegroundService(activity, Intent(activity, ActiveJobLocationService::class.java))
        ActiveJobLocationService.capture(activity, listOf("start_point")) { result.success(null) }
    }
}

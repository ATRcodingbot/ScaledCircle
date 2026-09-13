package com.scaledcircle.app

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel("scaledcircle_updates", "ScaledCircle updates", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Work, customer, Growth and account notifications"
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        ActiveJobTrackingBridge(this, flutterEngine.dartExecutor.binaryMessenger).register()
    }
}

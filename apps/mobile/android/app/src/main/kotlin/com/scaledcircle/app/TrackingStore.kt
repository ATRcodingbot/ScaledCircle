package com.scaledcircle.app

import android.content.Context
import android.location.Location
import org.json.JSONObject
import java.io.File

class TrackingStore(private val context: Context) {
    private val preferences = context.getSharedPreferences("active_job_tracking", Context.MODE_PRIVATE)
    private val pointsFile: File get() = File(context.filesDir, "scaled_circle_tracking_points.jsonl")

    @Synchronized
    fun start(config: Map<String, String>) {
        pointsFile.parentFile?.mkdirs()
        // Preserve queued evidence whenever the authoritative backend returns
        // the same long-lived session, including a retry after native startup
        // failed immediately after a segment was reopened.
        val resume = sessionId() == config["sessionId"]
        if (resume) {
            preferences.edit().putBoolean("active", true)
                .putLong("cutoffAtMs", config["cutoffAtMs"]?.toLongOrNull() ?: 0L)
                .remove("stopReason").remove("stoppedAtMs").apply()
            return
        }
        pointsFile.writeText("")
        preferences.edit().clear()
            .putBoolean("active", true)
            .putString("sessionId", config["sessionId"])
            .putString("campaignId", config["campaignId"])
            .putString("zoneId", config["zoneId"])
            .putString("scalerId", config["scalerId"])
            .putString("zoneName", config["zoneName"])
            .putLong("cutoffAtMs", config["cutoffAtMs"]?.toLongOrNull() ?: 0L)
            .putLong("startedAtMs", System.currentTimeMillis())
            .putInt("nextSequence", 1)
            .putInt("acknowledgedSequence", 0)
            .apply()
    }

    fun isActive(): Boolean = preferences.getBoolean("active", false)
    fun sessionId(): String? = preferences.getString("sessionId", null)
    fun zoneName(): String = preferences.getString("zoneName", "active job") ?: "active job"
    fun cutoffAtMs(): Long = preferences.getLong("cutoffAtMs", 0L)
    fun cutoffReached(nowMs: Long = System.currentTimeMillis()): Boolean =
        cutoffAtMs() > 0L && nowMs >= cutoffAtMs()

    @Synchronized
    fun append(location: Location, forcedFlags: List<String> = emptyList()): Map<String, Any?> {
        val flags = forcedFlags.toMutableList()
        val accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else Double.POSITIVE_INFINITY
        if (!location.latitude.isFinite() || !location.longitude.isFinite() ||
            location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0) flags.add("invalid_coordinates")
        if (!accuracy.isFinite() || accuracy > 100.0) flags.add("low_accuracy")
        if (location.hasSpeed() && location.speed > 15.0f) flags.add("impossible_speed")

        val previous = lastPoint()
        if (previous != null) {
            val elapsedSeconds = (location.time - (previous["timestampMs"] as? Number)?.toLong().orZero()) / 1000.0
            if (elapsedSeconds > 0) {
                val result = FloatArray(1)
                android.location.Location.distanceBetween(
                    (previous["latitude"] as Number).toDouble(), (previous["longitude"] as Number).toDouble(),
                    location.latitude, location.longitude, result,
                )
                if (result[0] / elapsedSeconds > 15.0) flags.add("impossible_jump")
            }
        }

        val sequence = preferences.getInt("nextSequence", 1)
        val accepted = flags.none { it == "invalid_coordinates" || it == "low_accuracy" || it == "impossible_speed" || it == "impossible_jump" }
        val json = JSONObject().apply {
            put("sequence", sequence)
            put("sessionId", sessionId())
            put("campaignId", preferences.getString("campaignId", null))
            put("zoneId", preferences.getString("zoneId", null))
            put("scalerId", preferences.getString("scalerId", null))
            put("latitude", location.latitude)
            put("longitude", location.longitude)
            put("timestampMs", if (location.time > 0) location.time else System.currentTimeMillis())
            put("horizontalAccuracy", accuracy)
            if (location.hasSpeed()) put("speed", location.speed.toDouble())
            if (location.hasBearing()) put("heading", location.bearing.toDouble())
            put("accepted", accepted)
            put("flags", org.json.JSONArray(flags))
        }
        pointsFile.appendText(json.toString() + "\n")
        preferences.edit().putInt("nextSequence", sequence + 1).putString("lastLocation", json.toString()).apply()
        return json.toMap()
    }

    @Synchronized
    fun stop(reason: String) {
        preferences.edit().putBoolean("active", false).putString("stopReason", reason).putLong("stoppedAtMs", System.currentTimeMillis()).apply()
    }

    fun state(): Map<String, Any?> {
        val next = preferences.getInt("nextSequence", 1)
        val acknowledged = preferences.getInt("acknowledgedSequence", 0)
        val last = preferences.getString("lastLocation", null)?.let { JSONObject(it).toMap() }
        return mapOf(
            "active" to isActive(), "sessionId" to sessionId(),
            "campaignId" to preferences.getString("campaignId", null), "zoneId" to preferences.getString("zoneId", null),
            "startedAtMs" to preferences.getLong("startedAtMs", 0), "pointCount" to next - 1,
            "pendingPointCount" to maxOf(0, next - 1 - acknowledged), "lastLocation" to last,
            "lastError" to preferences.getString("lastError", null),
        )
    }

    @Synchronized
    fun chunks(maximumPoints: Int): List<Map<String, Any?>> {
        val session = sessionId() ?: return emptyList()
        val acknowledged = preferences.getInt("acknowledgedSequence", 0)
        val points = readPoints().filter { ((it["sequence"] as? Number)?.toInt() ?: 0) > acknowledged }
        return points.chunked(maximumPoints.coerceIn(1, 100)).map { chunk ->
            val start = (chunk.first()["sequence"] as Number).toInt()
            val end = (chunk.last()["sequence"] as Number).toInt()
            mapOf("id" to "${session}_${start}_$end", "startSequence" to start, "endSequence" to end, "points" to chunk)
        }
    }

    fun acknowledge(endSequence: Int) {
        val current = preferences.getInt("acknowledgedSequence", 0)
        if (endSequence > current) preferences.edit().putInt("acknowledgedSequence", endSequence).apply()
    }

    /**
     * Remove evidence only after every local point is acknowledged and the
     * backend confirms the same session reached a terminal state.
     */
    @Synchronized
    fun purgeAcknowledgedEvidence(expectedSessionId: String): Boolean {
        if (sessionId() != expectedSessionId) return false
        val finalSequence = preferences.getInt("nextSequence", 1) - 1
        val acknowledged = preferences.getInt("acknowledgedSequence", 0)
        if (acknowledged < finalSequence) return false
        if (pointsFile.exists()) pointsFile.delete()
        preferences.edit().clear().apply()
        return true
    }

    private fun readPoints(): List<Map<String, Any?>> = if (!pointsFile.exists()) emptyList() else pointsFile.readLines().filter { it.isNotBlank() }.map { JSONObject(it).toMap() }
    private fun lastPoint(): Map<String, Any?>? = preferences.getString("lastLocation", null)?.let { JSONObject(it).toMap() }
    private fun Long?.orZero() = this ?: 0L

    private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key ->
        when (val value = get(key)) {
            is org.json.JSONArray -> (0 until value.length()).map { value.get(it) }
            JSONObject.NULL -> null
            else -> value
        }
    }
}

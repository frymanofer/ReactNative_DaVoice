package com.davoice.gabagool

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import java.io.File
import java.net.ServerSocket

class GabagoolService : Service() {

    private var proc: Process? = null
    @Volatile private var startupInFlight = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForeground MUST be called within ~5s — do it before anything else.
        startForeground(NOTIF_ID, buildNotification())

        if (startupInFlight || proc?.isAlive == true) {
            Log.i(TAG, "Gabagool gateway already starting/running; ignoring duplicate start")
            return START_STICKY
        }
        startupInFlight = true

        Thread {
            try {
                startGateway()
            } finally {
                startupInFlight = false
            }
        }.start()

        return START_STICKY
    }

    private fun startGateway() {
        proc?.let { existing ->
            if (existing.isAlive) {
                Log.i(TAG, "Gabagool gateway already running; ignoring duplicate start")
                return
            }
        }

        val bin = File(applicationInfo.nativeLibraryDir, "libgateway.so")
        if (!bin.exists() || !bin.canExecute()) {
            Log.e(TAG, "Gateway binary missing or not executable at ${bin.absolutePath}. " +
                "Ensure android:extractNativeLibs=\"true\" is set on <application>.")
            stopSelf()
            return
        }

        // Kill any orphaned gateway from a previous app run before binding the port.
        killOrphanedGateway()

        try {
            proc = ProcessBuilder(bin.absolutePath)
                .redirectErrorStream(true)
                .apply {
                    environment()["GABAGOOL_BIND_ADDR"] = "0.0.0.0:$PORT"
                    environment()["GABAGOOL_ENV"] = "dev"
                    environment()["GABAGOOL_LICENSE_KEY"] = ""
                    environment()["DATABASE_URL"] = ""
                    environment()["REDIS_URL"] = ""
                    environment()["GABAGOOL_AUGMENTATION_DEADLINE_MS"] = "2000"
                }
                .start()
            Log.i(TAG, "Gabagool gateway started on 0.0.0.0:$PORT")

            Thread {
                try {
                    proc?.inputStream?.bufferedReader()?.useLines { lines ->
                        lines.forEach { Log.i(TAG_GW, it) }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Gateway log drain ended: ${e.message}")
                }
            }.start()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start Gabagool gateway: ${e.message}", e)
            stopSelf()
        }
    }

    override fun onDestroy() {
        proc?.destroy()
        proc = null
        Log.i(TAG, "Gabagool gateway stopped")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun killOrphanedGateway() {
        // If port is in use, kill whatever is holding it before we try to bind.
        if (!isPortFree(PORT)) {
            Log.w(TAG, "Port $PORT in use — killing orphaned gateway process")
            try {
                Runtime.getRuntime().exec(arrayOf("sh", "-c", "pkill -f libgateway.so"))
                    .waitFor()
            } catch (e: Exception) {
                Log.w(TAG, "pkill failed: ${e.message}")
            }
            // Give the OS a moment to release the port.
            Thread.sleep(300)
        }
    }

    private fun isPortFree(port: Int): Boolean {
        return try {
            ServerSocket(port).use { true }
        } catch (e: Exception) {
            false
        }
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val chan = NotificationChannel(CHANNEL_ID, "Gabagool", NotificationManager.IMPORTANCE_MIN)
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(chan)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("Gabagool")
            .setContentText("AI augmentation layer running")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()
    }

    companion object {
        private const val TAG = "GabagoolService"
        private const val TAG_GW = "GabagoolGW"
        private const val NOTIF_ID = 7878
        private const val CHANNEL_ID = "gabagool"
        private const val PORT = 8788
    }
}

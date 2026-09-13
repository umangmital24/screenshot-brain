package com.umangmittal.screenshotmemory

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.widget.Toast
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Accessibility-free screenshot suggestions. */
class ScreenshotMonitorService : Service() {
  companion object {
    const val PREFS = "samhaal_screenshot_monitor"
    const val KEY_ENABLED = "enabled"
    const val LEGACY_PREFS = "samhaal_save_bubble"
    const val LEGACY_KEY_ENABLED = "native_screenshot_detection_enabled"

    private const val CHANNEL_SERVICE = "samhaal_screenshot_monitor"
    private const val CHANNEL_PROMPTS = "samhaal_screenshot_prompts"
    private const val SERVICE_NOTIFICATION_ID = 6101
    private const val PROMPT_NOTIFICATION_ID = 6102
    private const val ACTION_SAVE = "com.umangmittal.screenshotmemory.SCREENSHOT_SAVE"
    private const val ACTION_IGNORE = "com.umangmittal.screenshotmemory.SCREENSHOT_IGNORE"
    private const val EXTRA_URI = "screenshot_uri"

    fun isEnabled(context: Context): Boolean =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply()
      context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE).edit().putBoolean(LEGACY_KEY_ENABLED, false).apply()
      val intent = Intent(context, ScreenshotMonitorService::class.java)
      if (enabled) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      } else context.stopService(intent)
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var observer: ContentObserver? = null
  private var lastPromptedUri: String? = null
  private var lastPromptedAt = 0L

  override fun onCreate() {
    super.onCreate()
    createChannels()
    startForeground(SERVICE_NOTIFICATION_ID, serviceNotification())
    startWatching()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_SAVE -> {
        val uri = intent.getStringExtra(EXTRA_URI)?.let(Uri::parse)
        if (uri != null) {
          showProcessingNotification()
          processScreenshot(uri)
        }
      }
      ACTION_IGNORE -> notificationManager().cancel(PROMPT_NOTIFICATION_ID)
    }
    if (!isEnabled(this)) { stopSelf(); return START_NOT_STICKY }
    startWatching()
    return START_STICKY
  }

  override fun onDestroy() { stopWatching(); super.onDestroy() }
  override fun onBind(intent: Intent?): IBinder? = null

  private fun startWatching() {
    if (observer != null || !isEnabled(this) || !hasPhotoPermission()) return
    val newObserver = object : ContentObserver(handler) {
      override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)
        handler.postDelayed({ inspectLatestScreenshot() }, 600)
      }
    }
    contentResolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, newObserver)
    observer = newObserver
  }

  private fun stopWatching() {
    observer?.let { runCatching { contentResolver.unregisterContentObserver(it) } }
    observer = null
  }

  private fun hasPhotoPermission(): Boolean {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
    return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun inspectLatestScreenshot() {
    if (!isEnabled(this) || !hasPhotoPermission()) return
    val projection = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.RELATIVE_PATH, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.DATE_MODIFIED)
    runCatching {
      contentResolver.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection, null, null, "${MediaStore.Images.Media.DATE_ADDED} DESC")?.use { cursor ->
        if (!cursor.moveToFirst()) return@use
        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
        val name = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)).orEmpty()
        val path = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.RELATIVE_PATH)).orEmpty()
        val added = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
        val modified = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED))
        val timestampMs = maxOf(added, modified) * 1000L
        if (System.currentTimeMillis() - timestampMs > 20_000L || !looksLikeScreenshot(name, path)) return@use
        val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        val now = System.currentTimeMillis()
        if (uri.toString() == lastPromptedUri && now - lastPromptedAt < 30_000L) return@use
        lastPromptedUri = uri.toString(); lastPromptedAt = now
        showPrompt(uri)
      }
    }
  }

  private fun looksLikeScreenshot(name: String, path: String): Boolean {
    val value = "$path/$name".lowercase(Locale.US)
    if (value.contains("/samhaal/") || name.startsWith("Samhaal_", ignoreCase = true)) return false
    return listOf("screenshot", "screenshots", "screen_shot", "screen-shot", "screen shot", "screen capture", "screencapture").any(value::contains)
  }

  private fun showPrompt(uri: Uri) {
    Thread {
      val preview = decodePreview(uri)
      handler.post {
        val saveIntent = Intent(this, ScreenshotMonitorService::class.java).apply { action = ACTION_SAVE; putExtra(EXTRA_URI, uri.toString()) }
        val ignoreIntent = Intent(this, ScreenshotMonitorService::class.java).apply { action = ACTION_IGNORE; putExtra(EXTRA_URI, uri.toString()) }
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val savePending = PendingIntent.getService(this, 61021, saveIntent, pendingFlags)
        val ignorePending = PendingIntent.getService(this, 61022, ignoreIntent, pendingFlags)

        val builder = Notification.Builder(this, CHANNEL_PROMPTS)
          .setSmallIcon(R.drawable.samhaal_leaf_foreground)
          .setContentTitle("Keep this memory?")
          .setContentText("Save it now so you can find it later.")
          .setSubText("Samhaal")
          .setColor(Color.BLACK)
          .setPriority(Notification.PRIORITY_HIGH)
          .setCategory(Notification.CATEGORY_RECOMMENDATION)
          .setVisibility(Notification.VISIBILITY_SECRET)
          .setAutoCancel(true)
          .addAction(Notification.Action.Builder(null, "Save to Samhaal", savePending).build())
          .addAction(Notification.Action.Builder(null, "Ignore", ignorePending).build())

        if (preview != null) {
          builder.setLargeIcon(preview)
          builder.setStyle(Notification.BigPictureStyle().bigPicture(preview).setSummaryText("Screenshot captured · choose whether Samhaal should remember it."))
        } else {
          builder.setStyle(Notification.BigTextStyle().bigText("Screenshot captured. Save it to Samhaal now so you can find the exact memory later, or ignore it."))
        }
        notificationManager().notify(PROMPT_NOTIFICATION_ID, builder.build())
      }
    }.start()
  }

  private fun decodePreview(uri: Uri): Bitmap? = try {
    val source = ImageDecoder.createSource(contentResolver, uri)
    ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
      decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
      val maxSide = maxOf(info.size.width, info.size.height)
      if (maxSide > 720) {
        val scale = 720f / maxSide.toFloat()
        decoder.setTargetSize((info.size.width * scale).toInt().coerceAtLeast(1), (info.size.height * scale).toInt().coerceAtLeast(1))
      }
    }
  } catch (_: Exception) { null }

  private fun showProcessingNotification() {
    val notification = Notification.Builder(this, CHANNEL_PROMPTS)
      .setSmallIcon(R.drawable.samhaal_leaf_foreground)
      .setContentTitle("Remembering this…")
      .setContentText("Reading the useful details on your device.")
      .setSubText("Samhaal")
      .setColor(Color.BLACK)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setProgress(0, 0, true)
      .setOngoing(true)
      .build()
    notificationManager().notify(PROMPT_NOTIFICATION_ID, notification)
  }

  private fun showSavedNotification() {
    val notification = Notification.Builder(this, CHANNEL_PROMPTS)
      .setSmallIcon(R.drawable.samhaal_leaf_foreground)
      .setContentTitle("Remembered ✓")
      .setContentText("Saved to Samhaal. Ready to find after processing.")
      .setSubText("Samhaal")
      .setColor(Color.BLACK)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .setTimeoutAfter(5000)
      .build()
    notificationManager().notify(PROMPT_NOTIFICATION_ID, notification)
  }

  private fun processScreenshot(uri: Uri) {
    Thread {
      val bitmap = try {
        val source = ImageDecoder.createSource(contentResolver, uri)
        ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
          val maxSide = maxOf(info.size.width, info.size.height)
          if (maxSide > 2200) {
            val scale = 2200f / maxSide.toFloat()
            decoder.setTargetSize((info.size.width * scale).toInt().coerceAtLeast(1), (info.size.height * scale).toInt().coerceAtLeast(1))
          }
        }
      } catch (_: Exception) {
        handler.post { notificationManager().cancel(PROMPT_NOTIFICATION_ID); Toast.makeText(this, "Could not read that screenshot.", Toast.LENGTH_SHORT).show() }
        return@Thread
      }

      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(InputImage.fromBitmap(bitmap, 0))
        .addOnSuccessListener { result ->
          val text = result.text.trim()
          val blocks = buildOcrBlocksJson(result.textBlocks, bitmap.width, bitmap.height)
          recognizer.close(); bitmap.recycle()
          if (text.isBlank()) {
            notificationManager().cancel(PROMPT_NOTIFICATION_ID)
            Toast.makeText(this, "No readable text found in this screenshot.", Toast.LENGTH_SHORT).show()
            return@addOnSuccessListener
          }
          runCatching {
            UploadHeadlessTaskService.enqueueText(this, text, UUID.randomUUID().toString(), isoNow(), uri.toString(), "Android screenshot", blocks)
          }.onSuccess { showSavedNotification() }
            .onFailure { notificationManager().cancel(PROMPT_NOTIFICATION_ID); Toast.makeText(this, "Could not queue this screenshot for Samhaal.", Toast.LENGTH_SHORT).show() }
        }
        .addOnFailureListener {
          recognizer.close(); bitmap.recycle(); notificationManager().cancel(PROMPT_NOTIFICATION_ID)
          Toast.makeText(this, "Could not read this screenshot.", Toast.LENGTH_SHORT).show()
        }
    }.start()
  }

  private fun buildOcrBlocksJson(blocks: List<com.google.mlkit.vision.text.Text.TextBlock>, imageWidth: Int, imageHeight: Int): String {
    val array = JSONArray()
    if (imageWidth <= 0 || imageHeight <= 0) return array.toString()
    blocks.take(120).forEach { block ->
      val box = block.boundingBox ?: return@forEach
      array.put(JSONObject().apply {
        put("text", block.text.take(1200)); put("left", box.left.toDouble() / imageWidth); put("top", box.top.toDouble() / imageHeight); put("width", box.width().toDouble() / imageWidth); put("height", box.height().toDouble() / imageHeight)
      })
    }
    return array.toString()
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    notificationManager().createNotificationChannel(NotificationChannel(CHANNEL_SERVICE, "Screenshot suggestions", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Keeps screenshot detection available when Samhaal is in the background."; setShowBadge(false)
    })
    notificationManager().createNotificationChannel(NotificationChannel(CHANNEL_PROMPTS, "Screenshot save prompts", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Ask whether a new Android screenshot should be saved to Samhaal."
      lockscreenVisibility = Notification.VISIBILITY_SECRET
    })
  }

  private fun serviceNotification(): Notification = Notification.Builder(this, CHANNEL_SERVICE)
    .setSmallIcon(R.drawable.samhaal_leaf_foreground)
    .setContentTitle("Screenshot suggestions are on")
    .setContentText("Samhaal will ask when you take a normal screenshot.")
    .setSubText("Samhaal")
    .setColor(Color.BLACK)
    .setOngoing(true)
    .setCategory(Notification.CATEGORY_SERVICE)
    .build()

  private fun notificationManager() = getSystemService(NotificationManager::class.java)
  private fun isoNow(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }
}

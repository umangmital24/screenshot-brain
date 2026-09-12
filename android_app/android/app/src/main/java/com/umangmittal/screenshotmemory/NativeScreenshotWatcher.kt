package com.umangmittal.screenshotmemory

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
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

/**
 * Watches MediaStore for screenshots created by Android's normal screenshot flow.
 * It only runs after the user explicitly enables the feature and grants photo access.
 *
 * The screenshot remains in Gallery either way. If the user chooses Save, OCR runs
 * locally and only OCR text/geometry plus metadata is handed to Samhaal's backend.
 */
class NativeScreenshotWatcher(
  private val service: SaveBubbleAccessibilityService,
) {
  companion object {
    const val PREFS = "samhaal_save_bubble"
    const val KEY_ENABLED = "native_screenshot_detection_enabled"
  }

  private val handler = Handler(Looper.getMainLooper())
  private val resolver = service.contentResolver
  private val windowManager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private var observer: ContentObserver? = null
  private var promptView: View? = null
  private var lastPromptedUri: String? = null
  private var lastPromptedAt = 0L

  fun refresh() {
    stopWatching()
    startIfEnabled()
  }

  fun startIfEnabled() {
    if (!isEnabled() || !hasPhotoPermission() || observer != null) return

    val newObserver = object : ContentObserver(handler) {
      override fun onChange(selfChange: Boolean, uri: Uri?) {
        super.onChange(selfChange, uri)
        // MediaStore often fires while the screenshot is still being committed.
        handler.postDelayed({ inspectLatestScreenshot() }, 550)
      }
    }

    resolver.registerContentObserver(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      true,
      newObserver,
    )
    observer = newObserver
  }

  fun stopWatching() {
    observer?.let {
      try {
        resolver.unregisterContentObserver(it)
      } catch (_: Exception) {
      }
    }
    observer = null
    dismissPrompt()
  }

  private fun isEnabled(): Boolean =
    service.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

  private fun hasPhotoPermission(): Boolean {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Manifest.permission.READ_MEDIA_IMAGES
    } else {
      Manifest.permission.READ_EXTERNAL_STORAGE
    }
    return service.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun inspectLatestScreenshot() {
    if (!isEnabled() || !hasPhotoPermission()) return

    val projection = arrayOf(
      MediaStore.Images.Media._ID,
      MediaStore.Images.Media.DISPLAY_NAME,
      MediaStore.Images.Media.RELATIVE_PATH,
      MediaStore.Images.Media.DATE_ADDED,
      MediaStore.Images.Media.DATE_MODIFIED,
    )

    try {
      resolver.query(
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        projection,
        null,
        null,
        "${MediaStore.Images.Media.DATE_ADDED} DESC",
      )?.use { cursor ->
        if (!cursor.moveToFirst()) return

        val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
        val name = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)).orEmpty()
        val path = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.RELATIVE_PATH)).orEmpty()
        val added = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED))
        val modified = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED))
        val timestampMs = maxOf(added, modified) * 1000L

        if (System.currentTimeMillis() - timestampMs > 20_000L) return
        if (!looksLikeScreenshot(name, path)) return

        val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        val uriKey = uri.toString()
        val now = System.currentTimeMillis()
        if (uriKey == lastPromptedUri && now - lastPromptedAt < 30_000L) return

        lastPromptedUri = uriKey
        lastPromptedAt = now
        showSavePrompt(uri)
      }
    } catch (e: SecurityException) {
      service.reportDebugStage("Screenshot watcher needs photo permission")
    } catch (e: Exception) {
      service.reportDebugStage("Screenshot watcher error: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  private fun looksLikeScreenshot(name: String, path: String): Boolean {
    val value = "$path/$name".lowercase(Locale.US)
    if (value.contains("/samhaal/") || name.startsWith("Samhaal_", ignoreCase = true)) return false

    return listOf(
      "screenshot",
      "screenshots",
      "screen_shot",
      "screen-shot",
      "screen shot",
      "screen capture",
      "screencapture",
    ).any(value::contains)
  }

  private fun showSavePrompt(uri: Uri) {
    handler.post {
      dismissPrompt()

      val container = LinearLayout(service).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(14), dp(16), dp(13))
        background = roundedRect(Color.rgb(18, 18, 20), 18)
        elevation = dp(14).toFloat()
      }

      val title = TextView(service).apply {
        text = "Save screenshot to Samhaal?"
        textSize = 16f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Color.WHITE)
      }
      container.addView(title)

      val copy = TextView(service).apply {
        text = "Save makes it searchable later. Ignore leaves it only in your Gallery."
        textSize = 12.5f
        setTextColor(Color.rgb(200, 200, 205))
        setPadding(0, dp(5), 0, dp(12))
      }
      container.addView(copy)

      val actions = LinearLayout(service).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.END
      }

      val ignore = actionButton("Ignore", false).apply {
        setOnClickListener {
          dismissPrompt()
        }
      }
      actions.addView(ignore, LinearLayout.LayoutParams(0, dp(42), 1f).apply {
        marginEnd = dp(8)
      })

      val save = actionButton("Save to Samhaal", true).apply {
        setOnClickListener {
          dismissPrompt()
          Toast.makeText(service, "Saved to Samhaal · processing in background", Toast.LENGTH_SHORT).show()
          processScreenshot(uri)
        }
      }
      actions.addView(save, LinearLayout.LayoutParams(0, dp(42), 1.35f))

      container.addView(actions)

      val params = WindowManager.LayoutParams(
        (service.resources.displayMetrics.widthPixels - dp(28)).coerceAtLeast(dp(280)),
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
          WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
        PixelFormat.TRANSLUCENT,
      ).apply {
        gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        y = dp(72)
      }

      try {
        windowManager.addView(container, params)
        promptView = container
        handler.postDelayed({
          if (promptView === container) dismissPrompt()
        }, 8_000L)
      } catch (e: Exception) {
        service.reportDebugStage("Could not show screenshot prompt: ${e.message ?: e.javaClass.simpleName}")
      }
    }
  }

  private fun actionButton(label: String, primary: Boolean): TextView = TextView(service).apply {
    text = label
    textSize = 12.5f
    gravity = Gravity.CENTER
    setTypeface(typeface, Typeface.BOLD)
    setTextColor(if (primary) Color.BLACK else Color.WHITE)
    background = roundedRect(
      if (primary) Color.WHITE else Color.rgb(39, 39, 42),
      12,
    )
  }

  private fun dismissPrompt() {
    val view = promptView ?: return
    try {
      windowManager.removeView(view)
    } catch (_: Exception) {
    }
    promptView = null
  }

  private fun processScreenshot(uri: Uri) {
    Thread {
      val bitmap = try {
        val source = ImageDecoder.createSource(resolver, uri)
        ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
          val width = info.size.width
          val height = info.size.height
          val maxSide = maxOf(width, height)
          if (maxSide > 2200) {
            val scale = 2200f / maxSide.toFloat()
            decoder.setTargetSize(
              (width * scale).toInt().coerceAtLeast(1),
              (height * scale).toInt().coerceAtLeast(1),
            )
          }
        }
      } catch (e: Exception) {
        service.reportDebugStage("Could not read native screenshot: ${e.message ?: e.javaClass.simpleName}")
        handler.post {
          Toast.makeText(service, "Could not read that screenshot.", Toast.LENGTH_SHORT).show()
        }
        return@Thread
      }

      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      val image = InputImage.fromBitmap(bitmap, 0)
      recognizer.process(image)
        .addOnSuccessListener { result ->
          val text = result.text.trim()
          val blocksJson = buildOcrBlocksJson(result.textBlocks, bitmap.width, bitmap.height)
          recognizer.close()
          bitmap.recycle()

          if (text.isBlank()) {
            Toast.makeText(service, "No readable text found in this screenshot.", Toast.LENGTH_SHORT).show()
            return@addOnSuccessListener
          }

          try {
            UploadHeadlessTaskService.enqueueText(
              service,
              text,
              UUID.randomUUID().toString(),
              isoNow(),
              uri.toString(),
              service.currentForegroundSourceForScreenshot(),
              blocksJson,
            )
            service.reportDebugStage("Native screenshot queued for Samhaal")
          } catch (e: Exception) {
            service.reportDebugStage("Native screenshot queue failed: ${e.message ?: e.javaClass.simpleName}")
            Toast.makeText(service, "Could not queue this screenshot for Samhaal.", Toast.LENGTH_SHORT).show()
          }
        }
        .addOnFailureListener { e ->
          recognizer.close()
          bitmap.recycle()
          service.reportDebugStage("Native screenshot OCR failed: ${e.message ?: e.javaClass.simpleName}")
          Toast.makeText(service, "Could not read this screenshot.", Toast.LENGTH_SHORT).show()
        }
    }.start()
  }

  private fun buildOcrBlocksJson(
    blocks: List<com.google.mlkit.vision.text.Text.TextBlock>,
    imageWidth: Int,
    imageHeight: Int,
  ): String {
    val array = JSONArray()
    if (imageWidth <= 0 || imageHeight <= 0) return array.toString()

    blocks.take(120).forEach { block ->
      val box = block.boundingBox ?: return@forEach
      val item = JSONObject()
      item.put("text", block.text.take(1200))
      item.put("left", box.left.toDouble() / imageWidth)
      item.put("top", box.top.toDouble() / imageHeight)
      item.put("width", box.width().toDouble() / imageWidth)
      item.put("height", box.height().toDouble() / imageHeight)
      array.put(item)
    }
    return array.toString()
  }

  private fun isoNow(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }

  private fun roundedRect(color: Int, radiusDp: Int): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    setColor(color)
    cornerRadius = dp(radiusDp).toFloat()
  }

  private fun dp(value: Int): Int = (value * service.resources.displayMetrics.density).toInt()
}

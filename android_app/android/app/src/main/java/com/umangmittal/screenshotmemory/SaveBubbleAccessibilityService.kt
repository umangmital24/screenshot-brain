package com.umangmittal.screenshotmemory

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityService.ScreenshotResult
import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Display
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
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
import kotlin.math.abs

/**
 * Samhaal's explicit, user-triggered Save Bubble.
 * Accessibility is used only for the floating bubble, identifying the foreground package,
 * and takeScreenshot() after a tap. The accessibility node tree is never read.
 *
 * The captured screen is written once to Android MediaStore/Gallery. Samhaal keeps only
 * the resulting content URI as a local reference. OCR runs locally; only OCR text,
 * lightweight block geometry, source-app metadata and capture metadata go upstream.
 */
class SaveBubbleAccessibilityService : AccessibilityService() {

  companion object {
    @Volatile var isConnected: Boolean = false
    @Volatile var current: SaveBubbleAccessibilityService? = null
    private const val PREFS = "samhaal_save_bubble"
    private const val KEY_HIDDEN = "bubble_hidden"
  }

  private lateinit var windowManager: WindowManager
  private var bubble: TextView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var removeTarget: TextView? = null
  private var removeTargetParams: WindowManager.LayoutParams? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var busy = false
  private var foregroundPackage: String? = null

  override fun onServiceConnected() {
    super.onServiceConnected()
    isConnected = true
    current = this
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    if (!isHiddenByUser()) showBubble()
  }

  override fun onDestroy() {
    removeBubble(false)
    hideRemoveTarget()
    isConnected = false
    if (current === this) current = null
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    val pkg = event?.packageName?.toString()?.trim()
    if (!pkg.isNullOrBlank() && pkg != packageName) {
      foregroundPackage = pkg
    }
  }

  override fun onInterrupt() {}

  private fun prefs() = getSharedPreferences(PREFS, MODE_PRIVATE)
  private fun isHiddenByUser(): Boolean = prefs().getBoolean(KEY_HIDDEN, false)

  fun isBubbleVisible(): Boolean = bubble != null

  fun showBubbleFromApp() {
    prefs().edit().putBoolean(KEY_HIDDEN, false).apply()
    showBubble()
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun circle(color: Int): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(color)
  }

  private fun showBubble() {
    if (bubble != null) return

    val view = TextView(this).apply {
      text = "✦"
      textSize = 20f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      background = circle(Color.rgb(9, 9, 11))
      elevation = dp(10).toFloat()
      contentDescription = "Save this screen to Samhaal"
    }

    val screenWidth = resources.displayMetrics.widthPixels
    val screenHeight = resources.displayMetrics.heightPixels
    val size = dp(52)
    val margin = dp(10)

    val params = WindowManager.LayoutParams(
      size,
      size,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = (screenWidth - size - margin).coerceAtLeast(margin)
      y = ((screenHeight - size) / 2).coerceAtLeast(margin)
    }

    attachDragAndTap(view, params)
    windowManager.addView(view, params)
    bubble = view
    bubbleParams = params
  }

  private fun attachDragAndTap(view: View, params: WindowManager.LayoutParams) {
    var initialX = 0
    var initialY = 0
    var initialTouchX = 0f
    var initialTouchY = 0f
    var moved = false

    view.setOnTouchListener { _, event ->
      val screenWidth = resources.displayMetrics.widthPixels
      val screenHeight = resources.displayMetrics.heightPixels
      val size = dp(52)
      val margin = dp(8)

      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = params.x
          initialY = params.y
          initialTouchX = event.rawX
          initialTouchY = event.rawY
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - initialTouchX).toInt()
          val dy = (event.rawY - initialTouchY).toInt()
          if (abs(dx) > dp(4) || abs(dy) > dp(4)) {
            moved = true
            showRemoveTarget()
          }

          params.x = (initialX + dx).coerceIn(margin, (screenWidth - size - margin).coerceAtLeast(margin))
          params.y = (initialY + dy).coerceIn(margin, (screenHeight - size - margin).coerceAtLeast(margin))
          try { windowManager.updateViewLayout(view, params) } catch (_: Exception) {}
          updateRemoveTargetHighlight(event.rawX, event.rawY)
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) {
            hideRemoveTarget()
            captureCurrentScreen()
          } else if (isOverRemoveTarget(event.rawX, event.rawY)) {
            hideRemoveTarget()
            hideBubbleByUser()
          } else {
            hideRemoveTarget()
            snapToNearestEdge(view, params, event.rawX)
          }
          true
        }
        else -> false
      }
    }
  }

  private fun snapToNearestEdge(view: View, params: WindowManager.LayoutParams, rawX: Float) {
    val screenWidth = resources.displayMetrics.widthPixels
    val size = dp(52)
    val margin = dp(10)
    val targetX = if (rawX < screenWidth / 2f) margin else (screenWidth - size - margin).coerceAtLeast(margin)
    params.x = targetX
    try { windowManager.updateViewLayout(view, params) } catch (_: Exception) {}
  }

  private fun showRemoveTarget() {
    if (removeTarget != null) return
    val target = TextView(this).apply {
      text = "×\nRemove"
      textSize = 12f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      background = circle(Color.rgb(39, 39, 42))
      elevation = dp(12).toFloat()
    }
    val params = WindowManager.LayoutParams(
      dp(76),
      dp(76),
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      y = dp(28)
    }
    windowManager.addView(target, params)
    removeTarget = target
    removeTargetParams = params
  }

  private fun isOverRemoveTarget(rawX: Float, rawY: Float): Boolean {
    val screenWidth = resources.displayMetrics.widthPixels
    val screenHeight = resources.displayMetrics.heightPixels
    return abs(rawX - screenWidth / 2f) <= dp(90) && rawY >= screenHeight - dp(135)
  }

  private fun updateRemoveTargetHighlight(rawX: Float, rawY: Float) {
    removeTarget?.background = if (isOverRemoveTarget(rawX, rawY)) {
      circle(Color.rgb(220, 38, 38))
    } else {
      circle(Color.rgb(39, 39, 42))
    }
  }

  private fun hideRemoveTarget() {
    removeTarget?.let {
      try { windowManager.removeView(it) } catch (_: Exception) {}
    }
    removeTarget = null
    removeTargetParams = null
  }

  private fun hideBubbleByUser() {
    prefs().edit().putBoolean(KEY_HIDDEN, true).apply()
    removeBubble(false)
    Toast.makeText(this, "Save Bubble hidden. Open Samhaal to show it again.", Toast.LENGTH_SHORT).show()
  }

  private fun captureCurrentScreen() {
    if (busy) return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      Toast.makeText(this, "Save Bubble requires Android 11 or newer.", Toast.LENGTH_SHORT).show()
      return
    }

    busy = true
    setBubbleState("…")
    bubble?.visibility = View.INVISIBLE

    val sourceApp = sourceAppLabel(foregroundPackage)

    mainHandler.postDelayed({
      takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
        override fun onSuccess(screenshot: ScreenshotResult) {
          val buffer = screenshot.hardwareBuffer
          val hardwareBitmap = try { Bitmap.wrapHardwareBuffer(buffer, screenshot.colorSpace) } catch (_: Exception) { null }
          val bitmap = hardwareBitmap?.copy(Bitmap.Config.ARGB_8888, false)
          buffer.close()
          if (bitmap == null) {
            finishWithError("Could not capture this screen.")
            return
          }

          val eventId = UUID.randomUUID().toString()
          val capturedAt = isoNow()
          val screenshotUri = saveScreenshotToGallery(bitmap, eventId)
          if (screenshotUri == null) {
            bitmap.recycle()
            finishWithError("Could not save the screenshot to your gallery.")
            return
          }

          runOnDeviceOcr(bitmap, eventId, capturedAt, screenshotUri, sourceApp)
        }

        override fun onFailure(errorCode: Int) {
          finishWithError("This screen could not be captured.")
        }
      })
    }, 120)
  }

  private fun saveScreenshotToGallery(bitmap: Bitmap, eventId: String): String? {
    return try {
      val resolver = contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "Samhaal_${System.currentTimeMillis()}_${eventId.take(8)}.jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Samhaal")
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }

      val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return null
      var success = false
      try {
        resolver.openOutputStream(uri)?.use { output ->
          success = bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)
        }
        if (!success) {
          resolver.delete(uri, null, null)
          return null
        }

        val publishValues = ContentValues().apply {
          put(MediaStore.Images.Media.IS_PENDING, 0)
        }
        resolver.update(uri, publishValues, null, null)
        uri.toString()
      } catch (_: Exception) {
        resolver.delete(uri, null, null)
        null
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun runOnDeviceOcr(
    bitmap: Bitmap,
    eventId: String,
    capturedAt: String,
    screenshotUri: String,
    sourceApp: String,
  ) {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val image = InputImage.fromBitmap(bitmap, 0)

    recognizer.process(image)
      .addOnSuccessListener { result ->
        val text = result.text.trim()
        val blocksJson = buildOcrBlocksJson(result.textBlocks, bitmap.width, bitmap.height)
        recognizer.close()
        bitmap.recycle()

        if (text.isBlank()) {
          finishWithError("No readable text found. Screenshot kept in your gallery.")
          return@addOnSuccessListener
        }

        try {
          UploadHeadlessTaskService.enqueueText(
            this,
            text,
            eventId,
            capturedAt,
            screenshotUri,
            sourceApp,
            blocksJson,
          )
          mainHandler.postDelayed({
            if (busy) finishWithError("Save timed out. Screenshot is still in your gallery.")
          }, 60000)
        } catch (_: Exception) {
          finishWithError("Screenshot saved. Open Samhaal and try again.")
        }
      }
      .addOnFailureListener {
        recognizer.close()
        bitmap.recycle()
        finishWithError("Could not read this screen. Screenshot kept in your gallery.")
      }
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

  private fun sourceAppLabel(packageName: String?): String {
    val pkg = packageName?.trim().orEmpty()
    if (pkg.isBlank()) return "Unknown Android app"

    val friendly = when (pkg) {
      "com.instagram.android" -> "Instagram"
      "com.linkedin.android" -> "LinkedIn"
      "com.google.android.youtube" -> "YouTube"
      "com.android.chrome" -> "Chrome"
      "com.amazon.mShop.android.shopping" -> "Amazon"
      "net.one97.paytm" -> "Paytm"
      "in.swiggy.android" -> "Swiggy"
      "com.application.zomato" -> "Zomato"
      else -> null
    }
    return if (friendly != null) "$friendly ($pkg)" else pkg
  }

  fun reportSaveResult(success: Boolean, message: String? = null) {
    if (!busy) return
    if (success) {
      if (!message.isNullOrBlank()) Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
      finishWithSuccess()
    } else {
      finishWithError(message ?: "Could not save this memory.")
    }
  }

  private fun finishWithSuccess() {
    bubble?.visibility = View.VISIBLE
    setBubbleState("✓")
    mainHandler.postDelayed({
      setBubbleState("✦")
      busy = false
    }, 1000)
  }

  private fun finishWithError(message: String) {
    bubble?.visibility = View.VISIBLE
    setBubbleState("!")
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    mainHandler.postDelayed({
      setBubbleState("✦")
      busy = false
    }, 1200)
  }

  private fun isoNow(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }

  private fun setBubbleState(value: String) {
    mainHandler.post {
      bubble?.text = value
    }
  }

  private fun removeBubble(resetPreference: Boolean) {
    bubble?.let { try { windowManager.removeView(it) } catch (_: Exception) {} }
    bubble = null
    bubbleParams = null
    if (resetPreference) prefs().edit().putBoolean(KEY_HIDDEN, false).apply()
  }
}

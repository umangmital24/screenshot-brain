package com.umangmittal.screenshotmemory

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityService.ScreenshotResult
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
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
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.math.abs

/**
 * Samhaal's explicit, user-triggered Save Bubble.
 * Accessibility is used only for the floating bubble and takeScreenshot() after a tap.
 * A private local screenshot copy is retained for memory-card reference; only OCR text
 * and metadata are sent to the backend.
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
  private var currentLocalScreenshotPath: String? = null

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

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
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
    currentLocalScreenshotPath = null
    setBubbleState("…")
    bubble?.visibility = View.INVISIBLE

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
          val screenshotPath = savePrivateScreenshot(bitmap, eventId)
          if (screenshotPath == null) {
            bitmap.recycle()
            finishWithError("Could not save a local screenshot reference.")
            return
          }
          currentLocalScreenshotPath = screenshotPath
          runOnDeviceOcr(bitmap, eventId, capturedAt, screenshotPath)
        }

        override fun onFailure(errorCode: Int) {
          finishWithError("This screen could not be captured.")
        }
      })
    }, 120)
  }

  private fun savePrivateScreenshot(bitmap: Bitmap, eventId: String): String? {
    return try {
      val dir = File(filesDir, "samhaal_screenshots").apply { mkdirs() }
      val file = File(dir, "$eventId.jpg")
      FileOutputStream(file).use { output -> bitmap.compress(Bitmap.CompressFormat.JPEG, 88, output) }
      file.absolutePath
    } catch (_: Exception) {
      null
    }
  }

  private fun runOnDeviceOcr(bitmap: Bitmap, eventId: String, capturedAt: String, screenshotPath: String) {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val image = InputImage.fromBitmap(bitmap, 0)

    recognizer.process(image)
      .addOnSuccessListener { result ->
        recognizer.close()
        bitmap.recycle()
        val text = result.text.trim()
        if (text.isBlank()) {
          finishWithError("No readable text found.")
          return@addOnSuccessListener
        }

        try {
          UploadHeadlessTaskService.enqueueText(this, text, eventId, capturedAt, screenshotPath)
          mainHandler.postDelayed({
            if (busy) finishWithError("Save timed out. Open Samhaal and try again.", deleteLocalFile = false)
          }, 60000)
        } catch (_: Exception) {
          finishWithError("Open Samhaal and try again.")
        }
      }
      .addOnFailureListener {
        recognizer.close()
        bitmap.recycle()
        finishWithError("Could not read this screen.")
      }
  }

  fun reportSaveResult(success: Boolean, message: String? = null) {
    if (!busy) return
    if (success) finishWithSuccess() else finishWithError(message ?: "Could not save this screen.")
  }

  private fun finishWithSuccess() {
    currentLocalScreenshotPath = null
    bubble?.visibility = View.VISIBLE
    setBubbleState("✓")
    mainHandler.postDelayed({
      setBubbleState("✦")
      busy = false
    }, 1000)
  }

  private fun finishWithError(message: String, deleteLocalFile: Boolean = true) {
    if (deleteLocalFile) {
      currentLocalScreenshotPath?.let { path -> try { File(path).delete() } catch (_: Exception) {} }
      currentLocalScreenshotPath = null
    }
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
      bubble?.visibility = View.VISIBLE
    }
  }

  private fun removeBubble(resetPreference: Boolean) {
    bubble?.let { try { windowManager.removeView(it) } catch (_: Exception) {} }
    bubble = null
    bubbleParams = null
    if (resetPreference) prefs().edit().putBoolean(KEY_HIDDEN, false).apply()
  }
}

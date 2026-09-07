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
import kotlin.math.abs

/**
 * Samhaal's explicit, user-triggered Save Bubble.
 *
 * The service does not inspect the accessibility node tree and does not react to
 * other apps' events. Accessibility is used only for:
 *  1) TYPE_ACCESSIBILITY_OVERLAY for the edge bubble
 *  2) takeScreenshot() after the user taps that bubble
 *
 * Screenshot pixels stay in memory. ML Kit OCR runs locally and only recognized
 * text is forwarded to the authenticated JS headless task.
 */
class SaveBubbleAccessibilityService : AccessibilityService() {

  companion object {
    @Volatile var isConnected: Boolean = false
    @Volatile var current: SaveBubbleAccessibilityService? = null
  }

  private lateinit var windowManager: WindowManager
  private var bubble: TextView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var busy = false

  override fun onServiceConnected() {
    super.onServiceConnected()
    isConnected = true
    current = this
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    showBubble()
  }

  override fun onDestroy() {
    removeBubble()
    isConnected = false
    if (current === this) current = null
    super.onDestroy()
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Intentionally unused. Samhaal does not inspect screen content continuously.
  }

  override fun onInterrupt() {
    // No continuous accessibility work to interrupt.
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

    val params = WindowManager.LayoutParams(
      dp(52),
      dp(52),
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.END or Gravity.CENTER_VERTICAL
      x = dp(10)
      y = 0
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
          if (abs(dx) > dp(4) || abs(dy) > dp(4)) moved = true
          // Gravity.END means increasing x moves inward from the right edge.
          params.x = (initialX - dx).coerceAtLeast(0)
          params.y = initialY + dy
          try { windowManager.updateViewLayout(view, params) } catch (_: Exception) {}
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) captureCurrentScreen()
          true
        }
        else -> false
      }
    }
  }

  private fun captureCurrentScreen() {
    if (busy) return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      Toast.makeText(this, "Save Bubble requires Android 11 or newer.", Toast.LENGTH_SHORT).show()
      return
    }

    busy = true
    setBubbleState("…")

    // Hide the accessibility overlay before capture so it does not appear in OCR.
    bubble?.visibility = View.INVISIBLE
    mainHandler.postDelayed({
      takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
        override fun onSuccess(screenshot: ScreenshotResult) {
          val buffer = screenshot.hardwareBuffer
          val hardwareBitmap = try {
            Bitmap.wrapHardwareBuffer(buffer, screenshot.colorSpace)
          } catch (_: Exception) {
            null
          }
          val bitmap = hardwareBitmap?.copy(Bitmap.Config.ARGB_8888, false)
          buffer.close()
          if (bitmap == null) {
            finishWithError("Could not capture this screen.")
            return
          }

          runOnDeviceOcr(bitmap)
        }

        override fun onFailure(errorCode: Int) {
          finishWithError("This screen could not be captured.")
        }
      })
    }, 120)
  }

  private fun runOnDeviceOcr(bitmap: Bitmap) {
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
          UploadHeadlessTaskService.enqueueText(this, text)
          // Keep the bubble busy until the authenticated JS task confirms the backend save.
          mainHandler.postDelayed({
            if (busy) finishWithError("Save timed out. Open Samhaal and try again.")
          }, 30000)
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
    if (success) {
      finishWithSuccess()
    } else {
      finishWithError(message ?: "Could not save this screen.")
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

  private fun setBubbleState(value: String) {
    mainHandler.post {
      bubble?.text = value
      bubble?.visibility = View.VISIBLE
    }
  }

  private fun removeBubble() {
    bubble?.let {
      try { windowManager.removeView(it) } catch (_: Exception) {}
    }
    bubble = null
    bubbleParams = null
  }
}

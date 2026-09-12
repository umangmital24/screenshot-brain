package com.umangmittal.screenshotmemory

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.max
import kotlin.math.min

/**
 * Privacy boundary for Samhaal Android.
 * OCR and lightweight visual indexing run locally. Only derived text labels/color ratios
 * can leave the device; raw screenshot pixels are never uploaded by this module.
 */
class OnDeviceOcrModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "OnDeviceOcr"

  private data class ColorShare(val name: String, val ratio: Double)

  private fun parseUri(uriString: String): Uri =
    if (uriString.contains("://")) Uri.parse(uriString) else Uri.fromFile(File(uriString))

  @ReactMethod
  fun recognize(uriString: String, promise: Promise) {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      val image = InputImage.fromFilePath(reactContext, parseUri(uriString))

      recognizer.process(image)
        .addOnSuccessListener { result ->
          recognizer.close()
          promise.resolve(result.text)
        }
        .addOnFailureListener { error ->
          recognizer.close()
          promise.reject("OCR_FAILED", "Could not read text from this screenshot.", error)
        }
    } catch (error: Exception) {
      recognizer.close()
      promise.reject("OCR_INPUT_FAILED", "Could not open this screenshot for on-device OCR.", error)
    }
  }

  /**
   * Builds a structured, privacy-safe visual index. The returned JSON contains only
   * semantic labels and color ratios from the central content area, never image pixels.
   */
  @ReactMethod
  fun analyzeVisual(uriString: String, promise: Promise) {
    val bitmap = try {
      reactContext.contentResolver.openInputStream(parseUri(uriString))?.use { input ->
        BitmapFactory.decodeStream(input)
      }
    } catch (error: Exception) {
      null
    }

    if (bitmap == null) {
      promise.reject("VISUAL_INPUT_FAILED", "Could not open this screenshot for on-device visual indexing.")
      return
    }

    val crop = centralContentCrop(bitmap)
    val colors = prominentColors(crop)
    val labeler = ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_OPTIONS)
    val image = InputImage.fromBitmap(crop, 0)

    labeler.process(image)
      .addOnSuccessListener { labels ->
        val labelsJson = JSONArray()
        labels
          .filter { it.confidence >= 0.42f }
          .sortedByDescending { it.confidence }
          .distinctBy { it.text.trim().lowercase() }
          .take(8)
          .forEach { label ->
            labelsJson.put(
              JSONObject()
                .put("name", label.text.trim())
                .put("confidence", String.format(java.util.Locale.US, "%.3f", label.confidence).toDouble())
            )
          }

        val context = visualJson(labelsJson, colors)
        labeler.close()
        recycle(bitmap, crop)
        promise.resolve(context)
      }
      .addOnFailureListener { error ->
        labeler.close()
        val context = visualJson(JSONArray(), colors)
        recycle(bitmap, crop)
        if (colors.isNotEmpty()) {
          promise.resolve(context)
        } else {
          promise.reject("VISUAL_INDEX_FAILED", "Could not visually index this screenshot.", error)
        }
      }
  }

  private fun visualJson(labels: JSONArray, colors: List<ColorShare>): String {
    val colorsJson = JSONArray()
    colors.forEach { color ->
      colorsJson.put(
        JSONObject()
          .put("name", color.name)
          .put("ratio", String.format(java.util.Locale.US, "%.3f", color.ratio).toDouble())
      )
    }

    return JSONObject()
      .put("version", 2)
      .put("privacy", "derived_on_device")
      .put("region", "central_content")
      .put("labels", labels)
      .put("colors", colorsJson)
      .toString()
  }

  private fun recycle(bitmap: Bitmap, crop: Bitmap) {
    if (crop !== bitmap && !crop.isRecycled) crop.recycle()
    if (!bitmap.isRecycled) bitmap.recycle()
  }

  /**
   * Exclude most status-bar/search chrome and the lower action/title controls. The region
   * intentionally favors the visual content that a user is likely trying to remember.
   */
  private fun centralContentCrop(bitmap: Bitmap): Bitmap {
    if (bitmap.width < 40 || bitmap.height < 40) return bitmap

    val left = (bitmap.width * 0.03f).toInt()
    val top = (bitmap.height * 0.09f).toInt()
    val right = (bitmap.width * 0.97f).toInt().coerceAtMost(bitmap.width)
    val bottom = (bitmap.height * 0.76f).toInt().coerceAtMost(bitmap.height)
    val width = (right - left).coerceAtLeast(1)
    val height = (bottom - top).coerceAtLeast(1)

    return try {
      Bitmap.createBitmap(bitmap, left, top, width, height)
    } catch (_: Exception) {
      bitmap
    }
  }

  /**
   * Center-weighted color distribution. App chrome/background pixels still contribute,
   * but the middle of the saved visual gets 3x weight so the subject wins more often.
   */
  private fun prominentColors(bitmap: Bitmap): List<ColorShare> {
    val counts = linkedMapOf<String, Int>()
    var weightedSamples = 0
    val step = max(1, min(bitmap.width, bitmap.height) / 100)
    val hsv = FloatArray(3)

    var y = 0
    while (y < bitmap.height) {
      var x = 0
      while (x < bitmap.width) {
        val pixel = bitmap.getPixel(x, y)
        if (Color.alpha(pixel) >= 160) {
          Color.colorToHSV(pixel, hsv)
          val name = colorName(hsv[0], hsv[1], hsv[2])
          val xNorm = x.toFloat() / bitmap.width.toFloat()
          val yNorm = y.toFloat() / bitmap.height.toFloat()
          val weight = if (xNorm in 0.18f..0.82f && yNorm in 0.05f..0.92f) 3 else 1
          counts[name] = (counts[name] ?: 0) + weight
          weightedSamples += weight
        }
        x += step
      }
      y += step
    }

    if (weightedSamples == 0) return emptyList()

    return counts.entries
      .map { entry -> ColorShare(entry.key, entry.value.toDouble() / weightedSamples.toDouble()) }
      .filter { it.ratio >= 0.055 }
      .sortedByDescending { it.ratio }
      .take(6)
  }

  /**
   * Preserve dark chromatic colors instead of collapsing them into black. This is
   * important for clothing searches where wine/maroon/navy must not become "black".
   */
  private fun colorName(hue: Float, saturation: Float, value: Float): String {
    if (value < 0.15f || (value < 0.23f && saturation < 0.28f)) return "black"

    if (saturation < 0.12f) {
      return when {
        value > 0.90f -> "white"
        value > 0.66f -> "light gray"
        else -> "gray"
      }
    }

    if (saturation < 0.30f && value > 0.76f && hue in 18f..68f) {
      return if (value > 0.90f) "cream" else "beige"
    }

    return when {
      hue < 18f || hue >= 345f -> if (value < 0.58f) "wine" else "red"
      hue < 42f -> when {
        value < 0.46f -> "brown"
        saturation < 0.48f && value > 0.72f -> "beige"
        else -> "orange"
      }
      hue < 70f -> if (saturation < 0.40f && value > 0.78f) "cream" else "yellow"
      hue < 165f -> "green"
      hue < 200f -> "cyan"
      hue < 260f -> if (value < 0.42f) "navy" else "blue"
      hue < 300f -> "purple"
      hue < 345f -> if (value < 0.58f) "wine" else "pink"
      else -> "red"
    }
  }
}

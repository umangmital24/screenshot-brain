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
import java.io.File
import kotlin.math.max
import kotlin.math.min

/**
 * Privacy boundary for Samhaal Android.
 * OCR and lightweight visual indexing run locally. Only derived text labels/colors can
 * leave the device; raw screenshot pixels are never uploaded by this module.
 */
class OnDeviceOcrModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "OnDeviceOcr"

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
   * Builds search-only visual metadata such as "suit, formal wear, black".
   * This lets Ask Samhaal answer appearance questions without uploading the screenshot.
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
        val labelNames = labels
          .filter { it.confidence >= 0.42f }
          .sortedByDescending { it.confidence }
          .map { it.text.trim() }
          .filter { it.isNotBlank() }
          .distinctBy { it.lowercase() }
          .take(8)

        val parts = mutableListOf<String>()
        if (labelNames.isNotEmpty()) parts.add("Visual labels: ${labelNames.joinToString(", ")}")
        if (colors.isNotEmpty()) parts.add("Prominent colors: ${colors.joinToString(", ")}")
        val context = parts.joinToString(". ").take(1800)

        labeler.close()
        if (crop !== bitmap && !crop.isRecycled) crop.recycle()
        if (!bitmap.isRecycled) bitmap.recycle()
        promise.resolve(context)
      }
      .addOnFailureListener { error ->
        labeler.close()
        if (crop !== bitmap && !crop.isRecycled) crop.recycle()
        if (!bitmap.isRecycled) bitmap.recycle()

        // Color metadata is still useful when the labeler cannot classify the image.
        if (colors.isNotEmpty()) {
          promise.resolve("Prominent colors: ${colors.joinToString(", ")}")
        } else {
          promise.reject("VISUAL_INDEX_FAILED", "Could not visually index this screenshot.", error)
        }
      }
  }

  private fun centralContentCrop(bitmap: Bitmap): Bitmap {
    if (bitmap.width < 40 || bitmap.height < 40) return bitmap

    val left = (bitmap.width * 0.04f).toInt()
    val top = (bitmap.height * 0.08f).toInt()
    val right = (bitmap.width * 0.96f).toInt().coerceAtMost(bitmap.width)
    val bottom = (bitmap.height * 0.82f).toInt().coerceAtMost(bitmap.height)
    val width = (right - left).coerceAtLeast(1)
    val height = (bottom - top).coerceAtLeast(1)

    return try {
      Bitmap.createBitmap(bitmap, left, top, width, height)
    } catch (_: Exception) {
      bitmap
    }
  }

  private fun prominentColors(bitmap: Bitmap): List<String> {
    val counts = linkedMapOf<String, Int>()
    var sampled = 0
    val step = max(1, min(bitmap.width, bitmap.height) / 90)
    val hsv = FloatArray(3)

    var y = 0
    while (y < bitmap.height) {
      var x = 0
      while (x < bitmap.width) {
        val pixel = bitmap.getPixel(x, y)
        if (Color.alpha(pixel) >= 160) {
          Color.colorToHSV(pixel, hsv)
          val name = colorName(hsv[0], hsv[1], hsv[2])
          counts[name] = (counts[name] ?: 0) + 1
          sampled += 1
        }
        x += step
      }
      y += step
    }

    if (sampled == 0) return emptyList()

    val ranked = counts.entries
      .filter { (_, count) -> count.toFloat() / sampled.toFloat() >= 0.055f }
      .sortedByDescending { it.value }
      .map { it.key }
      .toMutableList()

    // Appearance questions often use "black" even when a white app background is dominant.
    val blackRatio = (counts["black"] ?: 0).toFloat() / sampled.toFloat()
    if (blackRatio >= 0.045f && !ranked.contains("black")) ranked.add(0, "black")

    return ranked.distinct().take(5)
  }

  private fun colorName(hue: Float, saturation: Float, value: Float): String {
    if (value < 0.24f) return "black"
    if (saturation < 0.12f && value > 0.88f) return "white"
    if (saturation < 0.16f) return "gray"

    return when {
      hue < 16f || hue >= 345f -> "red"
      hue < 45f -> "orange"
      hue < 70f -> "yellow"
      hue < 165f -> "green"
      hue < 200f -> "cyan"
      hue < 260f -> "blue"
      hue < 300f -> "purple"
      hue < 345f -> "pink"
      else -> "red"
    }
  }
}

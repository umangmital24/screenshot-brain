package com.umangmittal.screenshotmemory

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

/**
 * Privacy boundary for Samhaal Android.
 * Reads screenshot text locally with Google ML Kit and returns only OCR text to JS.
 * The image itself is never uploaded by this module.
 */
class OnDeviceOcrModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "OnDeviceOcr"

  @ReactMethod
  fun recognize(uriString: String, promise: Promise) {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      val uri = if (uriString.contains("://")) Uri.parse(uriString) else Uri.fromFile(File(uriString))
      val image = InputImage.fromFilePath(reactContext, uri)

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
}

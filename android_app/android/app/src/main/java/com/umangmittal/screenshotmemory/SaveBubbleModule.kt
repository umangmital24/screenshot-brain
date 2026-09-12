package com.umangmittal.screenshotmemory

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SaveBubbleModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName() = "SaveBubble"

  private fun serviceComponent(): ComponentName =
    ComponentName(reactContext, SaveBubbleAccessibilityService::class.java)

  private fun enabledInSettings(): Boolean {
    val enabled = Settings.Secure.getString(
      reactContext.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false

    val expected = serviceComponent().flattenToString()
    val expectedShort = serviceComponent().flattenToShortString()
    return enabled.split(':').any { it.equals(expected, true) || it.equals(expectedShort, true) }
  }

  private fun prefs() = reactContext.getSharedPreferences(
    NativeScreenshotWatcher.PREFS,
    Context.MODE_PRIVATE,
  )

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
  }

  @ReactMethod
  fun isEnabled(promise: Promise) {
    promise.resolve(enabledInSettings())
  }

  @ReactMethod
  fun isVisible(promise: Promise) {
    mainHandler.post {
      promise.resolve(SaveBubbleAccessibilityService.current?.isBubbleVisible() == true)
    }
  }

  @ReactMethod
  fun showBubble() {
    mainHandler.post {
      SaveBubbleAccessibilityService.current?.showBubbleFromApp()
    }
  }

  @ReactMethod
  fun isNativeScreenshotDetectionEnabled(promise: Promise) {
    promise.resolve(prefs().getBoolean(NativeScreenshotWatcher.KEY_ENABLED, false))
  }

  @ReactMethod
  fun setNativeScreenshotDetectionEnabled(enabled: Boolean) {
    prefs().edit().putBoolean(NativeScreenshotWatcher.KEY_ENABLED, enabled).apply()
    mainHandler.post {
      SaveBubbleAccessibilityService.current?.refreshNativeScreenshotDetection()
    }
  }

  @ReactMethod
  fun reportDebugStage(message: String?) {
    mainHandler.post {
      SaveBubbleAccessibilityService.current?.reportDebugStage(message)
    }
  }

  @ReactMethod
  fun reportSaveResult(success: Boolean, message: String?) {
    mainHandler.post {
      SaveBubbleAccessibilityService.current?.reportSaveResult(success, message)
    }
  }

  @ReactMethod
  fun reportSavePending(message: String?) {
    mainHandler.post {
      SaveBubbleAccessibilityService.current?.reportSavePending(message)
    }
  }

  @ReactMethod
  fun openAccessibilitySettings() {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    reactContext.startActivity(intent)
  }
}

package com.umangmittal.screenshotmemory

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SaveBubbleModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

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

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
  }

  @ReactMethod
  fun isEnabled(promise: Promise) {
    promise.resolve(enabledInSettings())
  }

  @ReactMethod
  fun reportSaveResult(success: Boolean, message: String?) {
    SaveBubbleAccessibilityService.current?.reportSaveResult(success, message)
  }

  @ReactMethod
  fun openAccessibilitySettings() {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    reactContext.startActivity(intent)
  }
}

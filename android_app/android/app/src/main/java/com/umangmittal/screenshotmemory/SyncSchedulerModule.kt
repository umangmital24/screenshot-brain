package com.umangmittal.screenshotmemory

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SyncSchedulerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SyncScheduler"

  @ReactMethod
  fun schedulePendingSync() {
    PendingSyncScheduler.scheduleNow(reactContext.applicationContext)
  }
}

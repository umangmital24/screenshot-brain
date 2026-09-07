package com.umangmittal.screenshotmemory

import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Bridges native Save Bubble OCR into the authenticated JS API layer. */
class UploadHeadlessTaskService : HeadlessJsTaskService() {

  companion object {
    fun enqueueText(context: Context, extractedText: String) {
      val intent = Intent(context, UploadHeadlessTaskService::class.java)
      intent.putExtra("extractedText", extractedText)
      context.startService(intent)
    }

    // Compatibility for the older screenshot watcher implementation.
    fun enqueueUpload(context: Context, filePath: String) {
      val intent = Intent(context, UploadHeadlessTaskService::class.java)
      intent.putExtra("filePath", filePath)
      context.startService(intent)
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: return null
    val extractedText = extras.getString("extractedText")
    val filePath = extras.getString("filePath")
    if (extractedText.isNullOrBlank() && filePath.isNullOrBlank()) return null

    val data = Arguments.createMap()
    if (!extractedText.isNullOrBlank()) data.putString("extractedText", extractedText)
    if (!filePath.isNullOrBlank()) data.putString("filePath", filePath)

    return HeadlessJsTaskConfig(
      "UploadScreenshotTask",
      data,
      30000,
      true,
    )
  }
}

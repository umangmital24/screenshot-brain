package com.umangmittal.screenshotmemory

import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Bridges native Save Bubble OCR and WorkManager retries into the authenticated JS API layer. */
class UploadHeadlessTaskService : HeadlessJsTaskService() {

  companion object {
    private fun startHeadless(context: Context, intent: Intent) {
      context.startService(intent)
      acquireWakeLockNow(context)
    }

    fun enqueueText(
      context: Context,
      extractedText: String,
      clientEventId: String,
      capturedAt: String,
      screenshotUri: String,
      sourceApp: String,
      ocrBlocksJson: String,
    ) {
      val intent = Intent(context, UploadHeadlessTaskService::class.java)
      intent.putExtra("extractedText", extractedText)
      intent.putExtra("clientEventId", clientEventId)
      intent.putExtra("capturedAt", capturedAt)
      intent.putExtra("screenshotUri", screenshotUri)
      intent.putExtra("sourceApp", sourceApp)
      intent.putExtra("ocrBlocksJson", ocrBlocksJson)
      startHeadless(context, intent)
    }

    fun enqueueSync(context: Context) {
      val intent = Intent(context, UploadHeadlessTaskService::class.java)
      intent.putExtra("syncPending", true)
      startHeadless(context, intent)
    }

    fun enqueueUpload(context: Context, filePath: String) {
      val intent = Intent(context, UploadHeadlessTaskService::class.java)
      intent.putExtra("filePath", filePath)
      startHeadless(context, intent)
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: return null
    val extractedText = extras.getString("extractedText")
    val filePath = extras.getString("filePath")
    val syncPending = extras.getBoolean("syncPending", false)
    if (extractedText.isNullOrBlank() && filePath.isNullOrBlank() && !syncPending) return null

    val data = Arguments.createMap()
    if (!extractedText.isNullOrBlank()) data.putString("extractedText", extractedText)
    if (!filePath.isNullOrBlank()) data.putString("filePath", filePath)
    if (syncPending) data.putBoolean("syncPending", true)
    extras.getString("clientEventId")?.let { data.putString("clientEventId", it) }
    extras.getString("capturedAt")?.let { data.putString("capturedAt", it) }
    extras.getString("screenshotUri")?.let { data.putString("screenshotUri", it) }
    extras.getString("sourceApp")?.let { data.putString("sourceApp", it) }
    extras.getString("ocrBlocksJson")?.let { data.putString("ocrBlocksJson", it) }

    return HeadlessJsTaskConfig(
      "UploadScreenshotTask",
      data,
      60000,
      true,
    )
  }
}

import { NativeModules, DeviceEventEmitter } from 'react-native'
import { saveExtractedText, uploadScreenshot } from './api'
import { saveLocalScreenshotReferences } from './localMemoryMedia'
import { enqueuePendingCapture, isRetryableCaptureError } from './pendingCaptureQueue'
import { supabase } from './supabaseClient'

const { SaveBubble } = NativeModules

function reportBubbleResult(success, message = null) {
  try {
    SaveBubble?.reportSaveResult?.(success, message)
  } catch {
    // The task can also be invoked by legacy/manual flows where no bubble exists.
  }
}

function parseBlocks(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Headless bridge used by the Android Save Bubble.
 * The screenshot itself lives in Android MediaStore/Gallery. Samhaal stores only
 * that local content URI as a memory reference. OCR text, source-app context,
 * lightweight OCR geometry and capture metadata are sent to the backend.
 */
export default async function uploadScreenshotTask(data) {
  const extractedText = data?.extractedText
  const filePath = data?.filePath
  const clientEventId = data?.clientEventId
  const capturedAt = data?.capturedAt
  const screenshotUri = data?.screenshotUri
  const sourceApp = data?.sourceApp || 'android_save_bubble'
  const ocrBlocks = parseBlocks(data?.ocrBlocksJson)
  if (!extractedText && !filePath) return

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    if (extractedText && clientEventId) {
      await enqueuePendingCapture({ extractedText, clientEventId, capturedAt, screenshotUri, sourceApp, ocrBlocks })
      reportBubbleResult(true, 'Saved locally. Open Samhaal after signing in to sync.')
    } else {
      reportBubbleResult(false, 'Open Samhaal and sign in first.')
    }
    return
  }

  try {
    if (extractedText) {
      const result = await saveExtractedText(extractedText, sourceApp, {
        clientEventId,
        capturedAt,
        ocrBlocks,
      })

      if (result.processing_status !== 'ready') {
        await enqueuePendingCapture({ extractedText, clientEventId, capturedAt, screenshotUri, sourceApp, ocrBlocks })
        reportBubbleResult(true, 'Saved. Samhaal is still syncing this memory.')
        return
      }

      await saveLocalScreenshotReferences(result.memories || [], screenshotUri, result.screenshot_id)
      reportBubbleResult(true)
      DeviceEventEmitter.emit('memoriesUpdated')
      return
    }

    const uri = filePath.includes('://') ? filePath : `file://${filePath}`
    await uploadScreenshot({ uri, appSource: 'android_legacy_overlay' })
    reportBubbleResult(true)
    DeviceEventEmitter.emit('memoriesUpdated')
  } catch (err) {
    if (extractedText && clientEventId && isRetryableCaptureError(err)) {
      await enqueuePendingCapture({
        extractedText,
        clientEventId,
        capturedAt,
        screenshotUri,
        sourceApp,
        ocrBlocks,
        lastError: err?.message || 'Sync failed',
      })
      reportBubbleResult(true, 'Saved locally. Samhaal will retry sync automatically.')
      return
    }

    reportBubbleResult(false, err.message || 'Could not save this screen.')
  }
}

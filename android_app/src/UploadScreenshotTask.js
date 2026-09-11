import { NativeModules, DeviceEventEmitter } from 'react-native'
import { createCapture, waitForCapture, uploadScreenshot } from './api'
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
 * Raw screenshot pixels stay on-device. Only OCR text, OCR geometry, source-app
 * context and capture metadata are sent to the Samhaal capture pipeline.
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
      const queued = await createCapture(extractedText, sourceApp, {
        clientEventId,
        capturedAt,
        ocrBlocks,
      })

      const result = await waitForCapture(queued.capture_id, { timeoutMs: 42000, pollMs: 1500 })
      if (result.status !== 'completed') {
        await enqueuePendingCapture({
          extractedText,
          clientEventId,
          capturedAt,
          screenshotUri,
          sourceApp,
          ocrBlocks,
          captureId: queued.capture_id,
          lastStatus: result.status,
        })
        reportBubbleResult(true, 'Saved. Samhaal is finishing this memory in the background.')
        return
      }

      await saveLocalScreenshotReferences(result.memories || [], screenshotUri, null)
      reportBubbleResult(true)
      DeviceEventEmitter.emit('memoriesUpdated')
      return
    }

    const uri = filePath.includes('://') ? filePath : `file://${filePath}`
    const result = await uploadScreenshot({ uri, appSource: 'android_legacy_overlay' })
    if (result.status !== 'completed') {
      reportBubbleResult(true, 'Saved. Samhaal is finishing this memory in the background.')
      return
    }
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
        captureId: err?.data?.capture_id || null,
        lastError: err?.message || 'Sync failed',
      })
      reportBubbleResult(true, 'Saved locally. Samhaal will retry sync automatically.')
      return
    }

    reportBubbleResult(false, err.message || 'Could not save this screen.')
  }
}

import { NativeModules, DeviceEventEmitter } from 'react-native'
import { createCapture, waitForCapture, uploadScreenshot } from './api'
import { saveLocalScreenshotReferences } from './localMemoryMedia'
import { enqueuePendingCapture, isRetryableCaptureError } from './pendingCaptureQueue'
import { supabase } from './supabaseClient'

const { SaveBubble, OnDeviceOcr } = NativeModules

function reportDebugStage(message) {
  try {
    SaveBubble?.reportDebugStage?.(message)
  } catch {
    // Debug overlay is best-effort only.
  }
}

function reportBubbleResult(success, message = null) {
  try {
    SaveBubble?.reportSaveResult?.(success, message)
  } catch {
    // The task can also be invoked by legacy/manual flows where no bubble exists.
  }
}

function reportBubblePending(message = null) {
  try {
    SaveBubble?.reportSavePending?.(message)
  } catch {
    // No native bubble is present in legacy/manual flows.
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

async function deriveVisualContext(screenshotUri) {
  if (!screenshotUri || typeof OnDeviceOcr?.analyzeVisual !== 'function') return ''
  try {
    reportDebugStage('Building private visual index on device')
    const context = await OnDeviceOcr.analyzeVisual(screenshotUri)
    return String(context || '').trim().slice(0, 2000)
  } catch (error) {
    reportDebugStage(`Visual indexing skipped: ${error?.message || 'unavailable'}`)
    return ''
  }
}

/**
 * Headless bridge used by Android screenshot capture flows.
 * Raw screenshot pixels stay on-device. OCR and visual indexing run locally. Only
 * OCR text, geometry, derived labels/colors, source-app context and metadata go upstream.
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

  reportDebugStage('JS headless task running')

  // Release the bubble immediately. Upload, classification and visual indexing continue
  // independently in the background.
  reportBubblePending('Captured. Samhaal will finish this memory in the background.')

  reportDebugStage('Checking signed-in session')

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    reportDebugStage('No active session')
    if (extractedText && clientEventId) {
      await enqueuePendingCapture({ extractedText, clientEventId, capturedAt, screenshotUri, sourceApp, ocrBlocks })
      reportDebugStage('Saved to local retry queue')
      reportBubblePending('Saved locally. Open Samhaal after signing in to sync.')
    } else {
      reportBubbleResult(false, 'Open Samhaal and sign in first.')
    }
    return
  }

  reportDebugStage('Session OK')
  let queuedCaptureId = null

  try {
    if (extractedText) {
      const visualContext = await deriveVisualContext(screenshotUri)

      reportDebugStage('POST /captures')
      const queued = await createCapture(extractedText, sourceApp, {
        clientEventId,
        capturedAt,
        ocrBlocks,
        entities: visualContext ? { visual_context: visualContext } : {},
      })
      queuedCaptureId = queued.capture_id
      reportDebugStage(`Capture queued: ${String(queuedCaptureId).slice(0, 8)}`)
      reportDebugStage('Waiting for backend worker')

      const result = await waitForCapture(queuedCaptureId, { timeoutMs: 42000, pollMs: 1500 })
      reportDebugStage(`Backend status: ${result.status}`)
      if (result.status !== 'completed') {
        await enqueuePendingCapture({
          extractedText,
          clientEventId,
          capturedAt,
          screenshotUri,
          sourceApp,
          ocrBlocks,
          entities: visualContext ? { visual_context: visualContext } : {},
          captureId: queuedCaptureId,
          lastStatus: result.status,
        })
        reportDebugStage('Queued for background retry')
        reportBubblePending('Saved. Samhaal is finishing this memory in the background.')
        return
      }

      reportDebugStage(`Memories created: ${(result.memories || []).length}`)
      await saveLocalScreenshotReferences(result.memories || [], screenshotUri, null)
      reportDebugStage('Local screenshot reference linked')
      reportBubbleResult(true)
      DeviceEventEmitter.emit('memoriesUpdated')
      return
    }

    reportDebugStage('Legacy screenshot upload path')
    const uri = filePath.includes('://') ? filePath : `file://${filePath}`
    const result = await uploadScreenshot({ uri, appSource: 'android_legacy_overlay' })
    reportDebugStage(`Legacy upload status: ${result.status}`)
    if (result.status !== 'completed') {
      reportBubblePending('Saved. Samhaal is finishing this memory in the background.')
      return
    }
    reportBubbleResult(true)
    DeviceEventEmitter.emit('memoriesUpdated')
  } catch (err) {
    const message = err?.message || 'Could not save this screen.'
    reportDebugStage(`JS error: ${message}`)

    if (extractedText && clientEventId && isRetryableCaptureError(err)) {
      await enqueuePendingCapture({
        extractedText,
        clientEventId,
        capturedAt,
        screenshotUri,
        sourceApp,
        ocrBlocks,
        captureId: queuedCaptureId,
        lastError: err?.message || 'Sync failed',
      })
      reportDebugStage('Retryable error; saved locally')
      reportBubblePending('Saved locally. Samhaal will retry sync automatically.')
      return
    }

    reportBubbleResult(false, message)
  }
}

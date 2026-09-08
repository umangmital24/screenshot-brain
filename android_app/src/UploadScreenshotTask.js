import { NativeModules, DeviceEventEmitter } from 'react-native'
import { saveExtractedText, uploadScreenshot } from './api'
import { saveLocalScreenshotReferences } from './localMemoryMedia'
import { supabase } from './supabaseClient'

const { SaveBubble } = NativeModules

function reportBubbleResult(success, message = null) {
  try {
    SaveBubble?.reportSaveResult?.(success, message)
  } catch {
    // The task can also be invoked by legacy/manual flows where no bubble exists.
  }
}

/**
 * Headless bridge used by the Android Save Bubble.
 * The screenshot itself lives in Android MediaStore/Gallery. Samhaal stores only
 * that local content URI as a memory reference. Only OCR text and small capture
 * metadata are sent to the backend.
 */
export default async function uploadScreenshotTask(data) {
  const extractedText = data?.extractedText
  const filePath = data?.filePath
  const clientEventId = data?.clientEventId
  const capturedAt = data?.capturedAt
  const screenshotUri = data?.screenshotUri
  if (!extractedText && !filePath) return

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    reportBubbleResult(false, 'Open Samhaal and sign in first.')
    return
  }

  try {
    if (extractedText) {
      const result = await saveExtractedText(extractedText, 'android_save_bubble', {
        clientEventId,
        capturedAt,
      })
      await saveLocalScreenshotReferences(result.memories || [], screenshotUri, result.screenshot_id)
      reportBubbleResult(true)
      DeviceEventEmitter.emit('memoriesUpdated')
      return
    }

    // Legacy/manual fallback kept for compatibility with older native callers.
    const uri = filePath.includes('://') ? filePath : `file://${filePath}`
    await uploadScreenshot({ uri, appSource: 'android_legacy_overlay' })
    reportBubbleResult(true)
    DeviceEventEmitter.emit('memoriesUpdated')
  } catch (err) {
    reportBubbleResult(false, err.message || 'Could not save this screen.')
    console.warn('Background save failed:', err.message)
  }
}

import { NativeModules, DeviceEventEmitter } from 'react-native'
import { saveExtractedText, uploadScreenshot } from './api'
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
 * Preferred path receives OCR text directly from the AccessibilityService, so
 * screenshot pixels never need to leave native memory or be written to the gallery.
 */
export default async function uploadScreenshotTask(data) {
  console.log('[uploadScreenshotTask] TRIGGERED with data keys:', Object.keys(data || {}))
  const extractedText = data?.extractedText
  const filePath = data?.filePath
  console.log('[uploadScreenshotTask] extractedText length:', extractedText?.length, 'filePath:', filePath)
  if (!extractedText && !filePath) return

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) {
    reportBubbleResult(false, 'Open Samhaal and sign in first.')
    return
  }

  try {
    if (extractedText) {
      await saveExtractedText(extractedText, 'android_save_bubble')
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

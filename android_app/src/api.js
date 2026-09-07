import { supabase } from './supabaseClient'
import { recognizeScreenshotText } from './onDeviceOcr'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE

async function authHeaders(extra = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

function requireApiBase() {
  if (!API_BASE) throw new Error('EXPO_PUBLIC_API_BASE is not configured.')
}

export async function fetchMemories(intent) {
  requireApiBase()
  const headers = await authHeaders()
  const url = intent ? `${API_BASE}/memories?intent=${encodeURIComponent(intent)}` : `${API_BASE}/memories`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error('Could not load memories')
  return res.json()
}

export async function fetchSummary() {
  requireApiBase()
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/memories/summary`, { headers })
  if (!res.ok) throw new Error('Could not load summary')
  return res.json()
}

export async function saveExtractedText(extractedText, appSource = 'android_save_bubble') {
  requireApiBase()
  const cleanText = String(extractedText || '').trim()
  console.log('[saveExtractedText] Starting save. Text length:', cleanText.length)
  console.log('[saveExtractedText] Text preview:', cleanText.slice(0, 120))
  if (!cleanText) throw new Error('No readable text was found on this screen.')

  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  console.log('[saveExtractedText] Authorization header present:', !!headers.Authorization, headers.Authorization ? headers.Authorization.slice(0, 30) + '...' : 'NONE')
  console.log('[saveExtractedText] POSTing to:', `${API_BASE}/screenshot/metadata`)
  const res = await fetch(`${API_BASE}/screenshot/metadata`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      extracted_text: cleanText,
      entities: {},
      app_source: appSource,
    }),
  })

  const text = await res.text()
  console.log('[saveExtractedText] Response status:', res.status, res.statusText)
  console.log('[saveExtractedText] Response body:', text)
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { detail: text }
  }

  if (!res.ok) throw new Error(data.detail || 'Could not save this screen')
  return data
}

/**
 * Manual/share-sheet privacy path. OCR happens locally; only text leaves the device.
 */
export async function uploadScreenshot(imageAsset) {
  const uri = imageAsset?.uri
  const extractedText = await recognizeScreenshotText(uri)
  return saveExtractedText(extractedText, imageAsset?.appSource || 'android_mlkit')
}

export async function askChat(question) {
  requireApiBase()
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Chat failed')
  return data
}

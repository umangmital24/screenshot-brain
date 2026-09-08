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

export async function saveExtractedText(
  extractedText,
  appSource = 'android_save_bubble',
  captureMeta = {},
) {
  requireApiBase()
  const cleanText = String(extractedText || '').trim()
  if (!cleanText) throw new Error('No readable text was found on this screen.')

  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const body = {
    extracted_text: cleanText,
    entities: {},
    app_source: appSource,
  }

  if (captureMeta.clientEventId) body.client_event_id = captureMeta.clientEventId
  if (captureMeta.capturedAt) body.captured_at = captureMeta.capturedAt

  const res = await fetch(`${API_BASE}/screenshot/metadata`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await res.text()
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

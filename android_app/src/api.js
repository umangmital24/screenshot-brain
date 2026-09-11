import { supabase } from './supabaseClient'
import { recognizeScreenshotText } from './onDeviceOcr'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE
const DEFAULT_POLL_MS = 1500
const DEFAULT_WAIT_MS = 45000

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

function apiError(message, status = null, data = null) {
  const error = new Error(typeof message === 'string' ? message : 'Request failed')
  error.status = status
  error.data = data
  return error
}

async function readJson(res) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { detail: text }
  }
}

function randomUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = Math.floor(Math.random() * 16)
    const v = char === 'x' ? r : ((r & 0x3) | 0x8)
    return v.toString(16)
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchMemories(intent) {
  requireApiBase()
  const headers = await authHeaders()
  const url = intent ? `${API_BASE}/memories?intent=${encodeURIComponent(intent)}` : `${API_BASE}/memories`
  const res = await fetch(url, { headers })
  if (!res.ok) throw apiError('Could not load memories', res.status)
  return res.json()
}

export async function fetchSummary() {
  requireApiBase()
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/memories/summary`, { headers })
  if (!res.ok) throw apiError('Could not load summary', res.status)
  return res.json()
}

export async function createCapture(
  extractedText,
  appSource = 'android_save_bubble',
  captureMeta = {},
) {
  requireApiBase()
  const cleanText = String(extractedText || '').trim()
  if (!cleanText) throw new Error('No readable text was found on this screen.')

  const clientEventId = captureMeta.clientEventId || randomUuid()
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const body = {
    client_event_id: clientEventId,
    capture_mode: captureMeta.captureMode || 'on_device_ocr',
    extracted_text: cleanText,
    entities: captureMeta.entities || {},
    app_source: appSource,
    ocr_blocks: Array.isArray(captureMeta.ocrBlocks) ? captureMeta.ocrBlocks : [],
    captured_at: captureMeta.capturedAt || new Date().toISOString(),
  }

  if (captureMeta.screenshotId) body.screenshot_id = captureMeta.screenshotId

  const res = await fetch(`${API_BASE}/captures`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const data = await readJson(res)
  if (!res.ok) throw apiError(data.detail || 'Could not queue this screen', res.status, data)
  return data
}

export async function getCapture(captureId) {
  requireApiBase()
  const headers = await authHeaders()
  const res = await fetch(`${API_BASE}/captures/${encodeURIComponent(captureId)}`, { headers })
  const data = await readJson(res)
  if (!res.ok) throw apiError(data.detail || 'Could not check capture status', res.status, data)
  return data
}

export async function retryCapture(captureId) {
  requireApiBase()
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(`${API_BASE}/captures/${encodeURIComponent(captureId)}/retry`, {
    method: 'POST',
    headers,
  })
  const data = await readJson(res)
  if (!res.ok) throw apiError(data.detail || 'Could not retry capture', res.status, data)
  return data
}

export async function waitForCapture(captureId, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_WAIT_MS)
  const pollMs = Number(options.pollMs || DEFAULT_POLL_MS)
  const startedAt = Date.now()
  let latest = await getCapture(captureId)

  while (Date.now() - startedAt < timeoutMs) {
    if (latest.status === 'completed') return latest
    if (latest.status === 'failed_permanent') {
      throw apiError(latest.last_error || 'This memory could not be processed.', 422, latest)
    }
    await sleep(pollMs)
    latest = await getCapture(captureId)
  }

  return latest
}

export async function saveExtractedText(
  extractedText,
  appSource = 'android_save_bubble',
  captureMeta = {},
) {
  const queued = captureMeta.captureId
    ? { capture_id: captureMeta.captureId, client_event_id: captureMeta.clientEventId }
    : await createCapture(extractedText, appSource, captureMeta)

  const result = await waitForCapture(queued.capture_id, {
    timeoutMs: captureMeta.timeoutMs,
    pollMs: captureMeta.pollMs,
  })

  return {
    ...result,
    capture_id: queued.capture_id,
    client_event_id: queued.client_event_id || result.client_event_id,
  }
}

/**
 * Manual/share-sheet privacy path. OCR happens locally; only OCR text leaves the device.
 */
export async function uploadScreenshot(imageAsset) {
  const uri = imageAsset?.uri
  const extractedText = await recognizeScreenshotText(uri)
  return saveExtractedText(extractedText, imageAsset?.appSource || 'android_mlkit', {
    clientEventId: imageAsset?.clientEventId || randomUuid(),
    capturedAt: imageAsset?.capturedAt || new Date().toISOString(),
  })
}

export async function askChat(question) {
  requireApiBase()
  const headers = await authHeaders({ 'Content-Type': 'application/json' })
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question, client_request_id: randomUuid() }),
  })
  const data = await readJson(res)
  if (!res.ok) throw apiError(data.detail || 'Chat failed', res.status, data)
  return data
}

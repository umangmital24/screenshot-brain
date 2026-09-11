import AsyncStorage from '@react-native-async-storage/async-storage'
import { DeviceEventEmitter } from 'react-native'
import { createCapture, getCapture, waitForCapture } from './api'
import { saveLocalScreenshotReferences } from './localMemoryMedia'
import { supabase } from './supabaseClient'

const KEY = 'samhaalPendingCaptureQueueV2'
const LEGACY_KEY = 'samhaalPendingCaptureQueueV1'
const MAX_PENDING = 50
let flushing = false

async function readStored(key) {
  try {
    const raw = await AsyncStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function readQueue() {
  const current = await readStored(KEY)
  if (current.length) return current

  const legacy = await readStored(LEGACY_KEY)
  if (!legacy.length) return []

  await writeQueue(legacy)
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {})
  return legacy
}

async function writeQueue(items) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_PENDING)))
}

export function isRetryableCaptureError(error) {
  const status = Number(error?.status || 0)
  if (!status) return true
  return status === 401 || status === 408 || status === 409 || status === 429 || status >= 500
}

export async function enqueuePendingCapture(capture) {
  if (!capture?.clientEventId || !capture?.extractedText) return
  const queue = await readQueue()
  const existingIndex = queue.findIndex((item) => item.clientEventId === capture.clientEventId)
  const next = {
    ...capture,
    queuedAt: capture.queuedAt || new Date().toISOString(),
    attempts: capture.attempts || 0,
  }

  if (existingIndex >= 0) queue[existingIndex] = { ...queue[existingIndex], ...next }
  else queue.push(next)

  await writeQueue(queue)
}

async function syncItem(item) {
  let captureId = item.captureId || null

  if (!captureId) {
    const queued = await createCapture(
      item.extractedText,
      item.sourceApp || 'android_save_bubble',
      {
        clientEventId: item.clientEventId,
        capturedAt: item.capturedAt,
        ocrBlocks: item.ocrBlocks || [],
      },
    )
    captureId = queued.capture_id
  } else {
    const current = await getCapture(captureId)
    if (current.status === 'completed') return { done: true, result: current, captureId }
    if (current.status === 'failed_permanent') {
      const error = new Error(current.last_error || 'Capture failed permanently')
      error.status = 422
      throw error
    }
  }

  const result = await waitForCapture(captureId, { timeoutMs: 12000, pollMs: 1500 })
  return { done: result.status === 'completed', result, captureId }
}

export async function flushPendingCaptures() {
  if (flushing) return { synced: 0, pending: (await readQueue()).length }
  flushing = true

  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return { synced: 0, pending: (await readQueue()).length }

    const queue = await readQueue()
    if (!queue.length) return { synced: 0, pending: 0 }

    const remaining = []
    let synced = 0

    for (const item of queue) {
      try {
        const { done, result, captureId } = await syncItem(item)
        if (!done) {
          remaining.push({
            ...item,
            captureId,
            attempts: (item.attempts || 0) + 1,
            lastStatus: result?.status || 'queued',
          })
          continue
        }

        await saveLocalScreenshotReferences(result.memories || [], item.screenshotUri, null)
        synced += 1
      } catch (error) {
        if (Number(error?.status || 0) === 422) continue
        remaining.push({
          ...item,
          attempts: (item.attempts || 0) + 1,
          lastError: error?.message || 'Sync failed',
        })
      }
    }

    await writeQueue(remaining)
    if (synced > 0) DeviceEventEmitter.emit('memoriesUpdated')
    return { synced, pending: remaining.length }
  } finally {
    flushing = false
  }
}

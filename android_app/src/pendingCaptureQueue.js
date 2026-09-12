import AsyncStorage from '@react-native-async-storage/async-storage'
import { DeviceEventEmitter, NativeModules } from 'react-native'
import { createCapture, getCapture, waitForCapture } from './api'
import { saveLocalScreenshotReferences } from './localMemoryMedia'
import { supabase } from './supabaseClient'

const { LocalStore, SyncScheduler } = NativeModules
const LEGACY_KEYS = ['samhaalPendingCaptureQueueV2', 'samhaalPendingCaptureQueueV1']
let flushing = false
let migrated = false

async function migrateLegacyQueue() {
  if (migrated || !LocalStore?.upsertPendingCapture) return
  migrated = true

  for (const key of LEGACY_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item?.clientEventId || !item?.extractedText) continue
          await LocalStore.upsertPendingCapture(item.clientEventId, JSON.stringify(item))
        }
      }
      await AsyncStorage.removeItem(key)
    } catch {
      // Legacy migration is best-effort; SQLite remains the authoritative store.
    }
  }
}

async function readQueue() {
  await migrateLegacyQueue()
  if (!LocalStore?.getPendingCaptures) return []
  try {
    const rows = await LocalStore.getPendingCaptures()
    return (rows || []).map((raw) => {
      try { return JSON.parse(raw) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

async function saveQueueItem(item) {
  if (!item?.clientEventId || !LocalStore?.upsertPendingCapture) return
  await LocalStore.upsertPendingCapture(item.clientEventId, JSON.stringify(item))
}

async function deleteQueueItem(clientEventId) {
  if (!clientEventId || !LocalStore?.deletePendingCapture) return
  await LocalStore.deletePendingCapture(clientEventId)
}

function scheduleBackgroundSync() {
  try {
    SyncScheduler?.schedulePendingSync?.()
  } catch {
    // Foreground/app-launch flush remains as a fallback.
  }
}

export function isRetryableCaptureError(error) {
  const status = Number(error?.status || 0)
  if (!status) return true
  return status === 401 || status === 408 || status === 409 || status === 429 || status >= 500
}

export async function enqueuePendingCapture(capture) {
  if (!capture?.clientEventId || !capture?.extractedText) return
  const existing = (await readQueue()).find((item) => item.clientEventId === capture.clientEventId)
  const next = {
    ...existing,
    ...capture,
    queuedAt: capture.queuedAt || existing?.queuedAt || new Date().toISOString(),
    attempts: capture.attempts ?? existing?.attempts ?? 0,
  }
  await saveQueueItem(next)
  scheduleBackgroundSync()
}

async function ensureCapture(item) {
  if (item.captureId) {
    try {
      const current = await getCapture(item.captureId)
      return { captureId: item.captureId, current }
    } catch (error) {
      if (Number(error?.status || 0) !== 404) throw error
    }
  }

  const queued = await createCapture(
    item.extractedText,
    item.sourceApp || 'android_save_bubble',
    {
      clientEventId: item.clientEventId,
      capturedAt: item.capturedAt,
      ocrBlocks: item.ocrBlocks || [],
      entities: item.entities || {},
    },
  )
  return { captureId: queued.capture_id, current: null }
}

async function syncItem(item) {
  const { captureId, current } = await ensureCapture(item)
  if (current?.status === 'completed') return { done: true, result: current, captureId }
  if (current?.status === 'failed_permanent') {
    const error = new Error(current.last_error || 'Capture failed permanently')
    error.status = 422
    throw error
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

    let synced = 0
    let pending = 0

    for (const item of queue) {
      try {
        const { done, result, captureId } = await syncItem(item)
        if (!done) {
          pending += 1
          await saveQueueItem({
            ...item,
            captureId,
            attempts: (item.attempts || 0) + 1,
            lastStatus: result?.status || 'queued',
          })
          continue
        }

        await saveLocalScreenshotReferences(result.memories || [], item.screenshotUri, null)
        await deleteQueueItem(item.clientEventId)
        synced += 1
      } catch (error) {
        if (Number(error?.status || 0) === 422) {
          await deleteQueueItem(item.clientEventId)
          continue
        }
        pending += 1
        await saveQueueItem({
          ...item,
          attempts: (item.attempts || 0) + 1,
          lastError: error?.message || 'Sync failed',
        })
      }
    }

    if (pending > 0) scheduleBackgroundSync()
    if (synced > 0) DeviceEventEmitter.emit('memoriesUpdated')
    return { synced, pending }
  } finally {
    flushing = false
  }
}

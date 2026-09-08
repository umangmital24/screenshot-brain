import AsyncStorage from '@react-native-async-storage/async-storage'
import { DeviceEventEmitter } from 'react-native'
import { saveExtractedText } from './api'
import { saveLocalScreenshotReferences } from './localMemoryMedia'
import { supabase } from './supabaseClient'

const KEY = 'samhaalPendingCaptureQueueV1'
const MAX_PENDING = 50
let flushing = false

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeQueue(items) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_PENDING)))
}

export function isRetryableCaptureError(error) {
  const status = Number(error?.status || 0)
  if (!status) return true
  return status === 401 || status === 408 || status === 429 || status >= 500
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
        const result = await saveExtractedText(
          item.extractedText,
          item.sourceApp || 'android_save_bubble',
          {
            clientEventId: item.clientEventId,
            capturedAt: item.capturedAt,
            ocrBlocks: item.ocrBlocks || [],
          },
        )

        if (result.processing_status !== 'ready') {
          remaining.push({ ...item, attempts: (item.attempts || 0) + 1 })
          continue
        }

        await saveLocalScreenshotReferences(
          result.memories || [],
          item.screenshotUri,
          result.screenshot_id,
        )
        synced += 1
      } catch (error) {
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

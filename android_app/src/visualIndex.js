import { NativeModules, Platform } from 'react-native'
import { updateMemoryVisualContext } from './api'

const { OnDeviceOcr } = NativeModules
const VISUAL_INDEX_VERSION = 2

function canAnalyze() {
  return Platform.OS === 'android' && typeof OnDeviceOcr?.analyzeVisual === 'function'
}

function parseVersion(raw) {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw)
    return Number(parsed?.version || 0)
  } catch {
    return 0
  }
}

/**
 * Adds privacy-preserving appearance metadata to memories that already have a local
 * screenshot reference. Raw screenshot pixels never leave the phone; only derived
 * semantic labels and color ratios are synchronized to the backend.
 */
export async function ensureVisualIndexes(memories = [], maxItems = 24) {
  if (!canAnalyze() || !Array.isArray(memories)) return {}

  const targets = memories
    .filter((memory) => (
      memory?.id
      && memory?.local_image_uri
      && parseVersion(memory?.visual_context) < VISUAL_INDEX_VERSION
    ))
    .slice(0, maxItems)

  const indexed = {}
  for (const memory of targets) {
    try {
      const context = String(await OnDeviceOcr.analyzeVisual(memory.local_image_uri) || '').trim()
      if (!context) continue
      await updateMemoryVisualContext(memory.id, context)
      indexed[memory.id] = context
    } catch (error) {
      // Best effort: visual indexing must never block Memories or Ask.
      console.warn('Visual index skipped:', memory?.id, error?.message || error)
    }
  }

  return indexed
}

export function applyVisualIndexes(memories = [], indexed = {}) {
  if (!indexed || Object.keys(indexed).length === 0) return memories
  return memories.map((memory) => (
    indexed[memory.id]
      ? { ...memory, visual_context: indexed[memory.id] }
      : memory
  ))
}

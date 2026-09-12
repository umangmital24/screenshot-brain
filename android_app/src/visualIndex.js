import { NativeModules, Platform } from 'react-native'
import { updateMemoryVisualContext } from './api'

const { OnDeviceOcr } = NativeModules

function canAnalyze() {
  return Platform.OS === 'android' && typeof OnDeviceOcr?.analyzeVisual === 'function'
}

/**
 * Adds privacy-preserving appearance metadata to memories that already have a local
 * screenshot reference. Raw screenshot pixels never leave the phone; only labels/colors
 * such as "Suit, Clothing · black, gray" are sent to the backend.
 */
export async function ensureVisualIndexes(memories = [], maxItems = 16) {
  if (!canAnalyze() || !Array.isArray(memories)) return {}

  const targets = memories
    .filter((memory) => memory?.id && memory?.local_image_uri && !memory?.visual_context)
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

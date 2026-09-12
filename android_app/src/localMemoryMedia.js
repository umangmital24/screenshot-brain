import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeModules } from 'react-native'

const { LocalStore } = NativeModules
const LEGACY_KEY = 'samhaalLocalMemoryMediaV2'
let migrated = false

async function migrateLegacyMedia() {
  if (migrated || !LocalStore?.upsertLocalMedia) return
  migrated = true
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY)
    const media = raw ? JSON.parse(raw) : {}
    for (const [memoryId, value] of Object.entries(media || {})) {
      if (!memoryId || !value?.uri) continue
      await LocalStore.upsertLocalMedia(
        memoryId,
        value.uri,
        value.screenshot_id || null,
        value.saved_at || new Date().toISOString(),
      )
    }
    await AsyncStorage.removeItem(LEGACY_KEY)
  } catch {
    // Existing references can be rebuilt as new captures are saved.
  }
}

export async function getLocalMemoryMedia() {
  await migrateLegacyMedia()
  if (!LocalStore?.getLocalMedia) return {}
  try {
    const rows = await LocalStore.getLocalMedia()
    return Object.fromEntries((rows || []).map((row) => [row.memory_id, {
      uri: row.uri,
      screenshot_id: row.screenshot_id || null,
      saved_at: row.saved_at,
    }]))
  } catch {
    return {}
  }
}

export async function saveLocalScreenshotReferences(memories = [], screenshotUri, screenshotId = null) {
  if (!screenshotUri || !Array.isArray(memories) || memories.length === 0) return
  await migrateLegacyMedia()
  if (!LocalStore?.upsertLocalMedia) return
  const savedAt = new Date().toISOString()

  for (const memory of memories) {
    if (!memory?.id) continue
    await LocalStore.upsertLocalMedia(
      memory.id,
      screenshotUri,
      screenshotId || memory.screenshot_id || null,
      savedAt,
    )
  }
}

export async function attachLocalMedia(memories = []) {
  const media = await getLocalMemoryMedia()
  return memories.map((memory) => ({
    ...memory,
    local_image_uri: media[memory.id]?.uri || null,
  }))
}

export async function attachLocalMediaToSources(sources = []) {
  const media = await getLocalMemoryMedia()
  return sources.map((source) => ({
    ...source,
    local_image_uri: media[source.memory_id]?.uri || null,
  }))
}

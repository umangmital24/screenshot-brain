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

async function mediaState(value) {
  if (!value?.uri) return { uri: null, status: 'missing' }
  if (!LocalStore?.isUriAvailable) return { uri: value.uri, status: 'available' }
  try {
    const available = await LocalStore.isUriAvailable(value.uri)
    return { uri: available ? value.uri : null, status: available ? 'available' : 'missing' }
  } catch {
    return { uri: value.uri, status: 'unknown' }
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
  return Promise.all(memories.map(async (memory) => {
    const state = await mediaState(media[memory.id])
    return {
      ...memory,
      local_image_uri: state.uri,
      local_image_status: state.status,
    }
  }))
}

export async function attachLocalMediaToSources(sources = []) {
  const media = await getLocalMemoryMedia()
  return Promise.all(sources.map(async (source) => {
    const state = await mediaState(media[source.memory_id])
    return {
      ...source,
      local_image_uri: state.uri,
      local_image_status: state.status,
    }
  }))
}

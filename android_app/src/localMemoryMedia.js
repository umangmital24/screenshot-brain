import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'samhaalLocalMemoryMediaV2'

export async function getLocalMemoryMedia() {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export async function saveLocalScreenshotReferences(memories = [], screenshotUri, screenshotId = null) {
  if (!screenshotUri || !Array.isArray(memories) || memories.length === 0) return
  const media = await getLocalMemoryMedia()

  for (const memory of memories) {
    if (!memory?.id) continue
    media[memory.id] = {
      uri: screenshotUri,
      screenshot_id: screenshotId || memory.screenshot_id || null,
      saved_at: new Date().toISOString(),
    }
  }

  await AsyncStorage.setItem(KEY, JSON.stringify(media))
}

export async function attachLocalMedia(memories = []) {
  const media = await getLocalMemoryMedia()
  return memories.map((memory) => ({
    ...memory,
    local_image_uri: media[memory.id]?.uri || null,
  }))
}

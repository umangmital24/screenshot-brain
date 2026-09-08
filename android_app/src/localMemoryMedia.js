import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'samhaalLocalMemoryMediaV1'

function toFileUri(path) {
  if (!path) return null
  return path.includes('://') ? path : `file://${path}`
}

export async function getLocalMemoryMedia() {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export async function saveLocalScreenshotReferences(memories = [], screenshotPath, screenshotId = null) {
  if (!screenshotPath || !Array.isArray(memories) || memories.length === 0) return
  const media = await getLocalMemoryMedia()
  const uri = toFileUri(screenshotPath)

  for (const memory of memories) {
    if (!memory?.id) continue
    media[memory.id] = {
      uri,
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

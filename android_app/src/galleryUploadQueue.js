import { uploadScreenshot } from './api'
import { saveLocalScreenshotReferences } from './localMemoryMedia'

const CONCURRENCY = 3

export async function processGalleryUploadQueue(assets, onProgress) {
  const queue = (assets || []).map((asset, index) => ({
    id: asset.assetId || asset.uri || String(index),
    uri: asset.uri,
    fileName: asset.fileName || `Screenshot ${index + 1}`,
    status: 'queued',
    error: null,
  }))

  const emit = () => onProgress?.(queue.map((item) => ({ ...item })))
  emit()

  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= queue.length) return
      const item = queue[index]
      try {
        item.status = 'ocr'
        emit()
        const result = await uploadScreenshot({ uri: item.uri, appSource: 'android_gallery_upload' })
        item.status = result.status === 'completed' ? 'saved' : 'processing'
        if (result.status === 'completed') {
          await saveLocalScreenshotReferences(result.memories || [], item.uri, null)
        }
        emit()
      } catch (error) {
        item.status = 'failed'
        item.error = error?.message || 'Upload failed'
        emit()
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()))
  return queue
}

export async function retryGalleryUploadItem(item) {
  const result = await uploadScreenshot({ uri: item.uri, appSource: 'android_gallery_upload' })
  if (result.status === 'completed') {
    await saveLocalScreenshotReferences(result.memories || [], item.uri, null)
  }
  return result
}

import { NativeModules, Platform } from 'react-native'

const { OnDeviceOcr } = NativeModules

export const isOnDeviceOcrAvailable = Platform.OS === 'android' && !!OnDeviceOcr

export async function recognizeScreenshotText(uri) {
  if (!isOnDeviceOcrAvailable) {
    throw new Error('On-device OCR is unavailable in this build.')
  }
  if (!uri) throw new Error('No screenshot was provided.')

  const result = await OnDeviceOcr.recognize(uri)
  const text = typeof result === 'string' ? result : result?.text
  if (!text || !text.trim()) {
    throw new Error('No readable text was found in this screenshot.')
  }
  return text.trim()
}

import { NativeModules, Platform } from 'react-native'

const { SaveBubble } = NativeModules

const unsupported = Platform.OS !== 'android' || !SaveBubble

export async function isSaveBubbleSupported() {
  if (unsupported) return false
  return SaveBubble.isSupported()
}

export async function isSaveBubbleEnabled() {
  if (unsupported) return false
  return SaveBubble.isEnabled()
}

export async function isSaveBubbleVisible() {
  if (unsupported) return false
  return SaveBubble.isVisible()
}

export function showSaveBubble() {
  if (unsupported) return
  SaveBubble.showBubble()
}

export function openAccessibilitySettings() {
  if (unsupported) return
  SaveBubble.openAccessibilitySettings()
}

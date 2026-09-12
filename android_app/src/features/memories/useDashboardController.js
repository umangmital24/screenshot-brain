import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../supabaseClient'
import { fetchMemories } from '../../api'
import { attachLocalMedia } from '../../localMemoryMedia'
import {
  isNativeScreenshotDetectionEnabled,
  isSaveBubbleEnabled,
  isSaveBubbleSupported,
  isSaveBubbleVisible,
  openAccessibilitySettings,
  setNativeScreenshotDetectionEnabled,
  showSaveBubble,
} from '../../saveBubble'

const SETUP_SEEN_KEY = 'samhaalSaveBubbleGuideSeen'

function screenshotPermission() {
  if (Platform.OS !== 'android') return null
  return Number(Platform.Version) >= 33
    ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
}

async function hasScreenshotMediaAccess() {
  const permission = screenshotPermission()
  if (!permission) return false
  return PermissionsAndroid.check(permission)
}

export default function useDashboardController() {
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [bubbleSupported, setBubbleSupported] = useState(false)
  const [bubbleEnabled, setBubbleEnabled] = useState(false)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [nativeScreenshotDetection, setNativeScreenshotDetectionState] = useState(false)
  const [screenshotMediaAccess, setScreenshotMediaAccess] = useState(false)
  const [setupGuideVisible, setSetupGuideVisible] = useState(false)
  const [previewImageUri, setPreviewImageUri] = useState(null)
  const [accountVisible, setAccountVisible] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const awaitingSettingsReturn = useRef(false)

  const refreshNativeScreenshotState = useCallback(async () => {
    const [enabled, access] = await Promise.all([
      isNativeScreenshotDetectionEnabled(),
      hasScreenshotMediaAccess(),
    ])
    setNativeScreenshotDetectionState(enabled)
    setScreenshotMediaAccess(access)
  }, [])

  const refreshBubbleState = useCallback(async (allowAutoGuide = false) => {
    const supported = await isSaveBubbleSupported()
    const enabled = supported ? await isSaveBubbleEnabled() : false
    const visible = enabled ? await isSaveBubbleVisible() : false
    setBubbleSupported(supported)
    setBubbleEnabled(enabled)
    setBubbleVisible(visible)

    if (allowAutoGuide && supported && !enabled) {
      const seen = await AsyncStorage.getItem(SETUP_SEEN_KEY)
      if (!seen) setSetupGuideVisible(true)
    }
  }, [])

  const load = useCallback(async (showFullLoader = true) => {
    if (showFullLoader) setLoading(true)
    try {
      const data = await fetchMemories()
      const withLocalMedia = await attachLocalMedia(data.memories || [])
      setMemories(withLocalMedia)
    } catch (err) {
      if (showFullLoader) Alert.alert('Could not load your memories', err.message)
      else console.warn('Silent refresh failed:', err.message)
    } finally {
      if (showFullLoader) setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    load(false)
    refreshBubbleState(false)
    refreshNativeScreenshotState()
  }, [load, refreshBubbleState, refreshNativeScreenshotState])

  useEffect(() => {
    refreshBubbleState(true)
    refreshNativeScreenshotState()
  }, [refreshBubbleState, refreshNativeScreenshotState])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return
      load(false)
      await refreshBubbleState(false)
      await refreshNativeScreenshotState()
      if (awaitingSettingsReturn.current) {
        awaitingSettingsReturn.current = false
        const enabled = await isSaveBubbleEnabled()
        if (enabled) setSetupGuideVisible(false)
      }
    })
    return () => sub.remove()
  }, [load, refreshBubbleState, refreshNativeScreenshotState])

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('memoriesUpdated', () => load(false))
    return () => sub.remove()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load(memories.length === 0)
      refreshBubbleState(false)
      refreshNativeScreenshotState()
      return undefined
    }, [load, refreshBubbleState, refreshNativeScreenshotState, memories.length])
  )

  async function handleBubbleCardPress() {
    if (!bubbleSupported) return
    if (!bubbleEnabled) {
      setSetupGuideVisible(true)
      return
    }
    if (!bubbleVisible) {
      showSaveBubble()
      setTimeout(() => refreshBubbleState(false), 150)
      return
    }
    setSetupGuideVisible(true)
  }

  async function toggleNativeScreenshotDetection() {
    if (!bubbleSupported) return
    if (nativeScreenshotDetection) {
      setNativeScreenshotDetectionEnabled(false)
      setNativeScreenshotDetectionState(false)
      return
    }
    if (!bubbleEnabled) {
      Alert.alert(
        'Enable Samhaal access first',
        'Screenshot suggestions use the same Android Accessibility service as the Save Bubble. Enable it once, then turn this option on.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open setup', onPress: () => setSetupGuideVisible(true) },
        ],
      )
      return
    }

    let access = screenshotMediaAccess || await hasScreenshotMediaAccess()
    if (!access) {
      const permission = screenshotPermission()
      if (!permission) return
      const result = await PermissionsAndroid.request(permission, {
        title: 'Allow screenshot suggestions',
        message: 'Samhaal needs photo access only to notice newly created screenshots. It does not read screenshot pixels unless you tap Save to Samhaal.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      })
      access = result === PermissionsAndroid.RESULTS.GRANTED
      setScreenshotMediaAccess(access)
    }
    if (!access) {
      Alert.alert(
        'Photo access is required',
        'To notice normal Android screenshots, Samhaal needs access to images. You can keep using the Save Bubble without this permission.',
      )
      return
    }
    setNativeScreenshotDetectionEnabled(true)
    setNativeScreenshotDetectionState(true)
  }

  async function continueToSettings() {
    await AsyncStorage.setItem(SETUP_SEEN_KEY, 'true')
    awaitingSettingsReturn.current = true
    openAccessibilitySettings()
  }

  async function dismissSetup() {
    await AsyncStorage.setItem(SETUP_SEEN_KEY, 'true')
    setSetupGuideVisible(false)
  }

  async function openAccountMenu() {
    try {
      const { data } = await supabase.auth.getUser()
      setAccountEmail(data?.user?.email || '')
    } catch {
      setAccountEmail('')
    }
    setAccountVisible(true)
  }

  function confirmLogout() {
    Alert.alert(
      'Log out of Samhaal?',
      'You can sign back in anytime. Your saved memories stay in your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            setAccountVisible(false)
            await supabase.auth.signOut()
          },
        },
      ],
    )
  }

  return {
    memories, loading, refreshing,
    bubbleSupported, bubbleEnabled, bubbleVisible,
    nativeScreenshotDetection, screenshotMediaAccess,
    setupGuideVisible, setSetupGuideVisible,
    previewImageUri, setPreviewImageUri,
    accountVisible, setAccountVisible, accountEmail,
    handleRefresh, handleBubbleCardPress, toggleNativeScreenshotDetection,
    continueToSettings, dismissSetup, openAccountMenu, confirmLogout,
  }
}

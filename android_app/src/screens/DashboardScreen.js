import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  AppState,
  DeviceEventEmitter,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../supabaseClient'
import { deleteMemory, fetchMemories } from '../api'
import { attachLocalMedia } from '../localMemoryMedia'
import { processGalleryUploadQueue, retryGalleryUploadItem } from '../galleryUploadQueue'
import { colors, intentLabel, timeAgo } from '../theme'
import OverlaySetupGuide from '../components/OverlaySetupGuide'
import {
  isNativeScreenshotDetectionEnabled,
  isSaveBubbleEnabled,
  isSaveBubbleSupported,
  isSaveBubbleVisible,
  openAccessibilitySettings,
  setNativeScreenshotDetectionEnabled,
  showSaveBubble,
} from '../saveBubble'

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

const SAMPLE_MEMORIES = [
  {
    id: 'sample-1',
    intent: 'APPLY_LATER',
    item_name: 'AI Engineer — Applied AI',
    summary: 'Python, FastAPI and LLM systems. Saved from a job post.',
    category: 'Jobs',
    last_seen: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    frequency: 1,
    demo: true,
  },
  {
    id: 'sample-2',
    intent: 'VISIT_LATER',
    item_name: 'Burma Burma, Cyber Hub',
    summary: 'A restaurant you wanted to remember for the weekend.',
    category: 'Places',
    last_seen: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    frequency: 1,
    demo: true,
  },
]

function MemoryCard({ memory, onOpenImage, onDelete }) {
  return (
    <View style={[styles.card, memory.demo && styles.demoCard]}>
      {memory.local_image_uri ? (
        <TouchableOpacity
          style={styles.thumbnailWrap}
          activeOpacity={0.9}
          onPress={() => onOpenImage(memory.local_image_uri)}
          accessibilityLabel={`Open screenshot for ${memory.item_name}`}
        >
          <Image source={{ uri: memory.local_image_uri }} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.imageBadge}>
            <Ionicons name="expand-outline" size={13} color={colors.white} />
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={styles.cardTopRow}>
        <Text style={styles.intent}>{intentLabel(memory.intent)}</Text>
        <View style={styles.cardActions}>
          <Text style={styles.timeText}>{memory.demo ? 'Example' : timeAgo(memory.last_seen)}</Text>
          {!memory.demo ? (
            <TouchableOpacity onPress={() => onDelete(memory)} style={styles.deleteButton} accessibilityLabel={`Delete ${memory.item_name}`}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <Text style={styles.itemName}>{memory.item_name}</Text>
      {memory.summary ? <Text style={styles.summary}>{memory.summary}</Text> : null}
      <Text style={styles.category}>{memory.category || 'Saved memory'}</Text>
    </View>
  )
}

function UploadQueuePanel({ queue, onRetry }) {
  if (!queue.length) return null
  const saved = queue.filter((item) => item.status === 'saved').length
  const failed = queue.filter((item) => item.status === 'failed').length
  const active = queue.some((item) => ['queued', 'ocr', 'processing'].includes(item.status))

  return (
    <View style={styles.queuePanel}>
      <View style={styles.queueHeader}>
        <View>
          <Text style={styles.queueTitle}>Screenshot import</Text>
          <Text style={styles.queueProgress}>{saved}/{queue.length} saved{failed ? ` · ${failed} failed` : ''}</Text>
        </View>
        {active ? <ActivityIndicator color={colors.black} /> : <Ionicons name="checkmark-circle-outline" size={20} color={colors.textMuted} />}
      </View>
      {queue.slice(0, 6).map((item) => (
        <View key={item.id} style={styles.queueRow}>
          <Ionicons
            name={item.status === 'saved' ? 'checkmark-circle' : item.status === 'failed' ? 'alert-circle-outline' : 'time-outline'}
            size={16}
            color={item.status === 'failed' ? '#DC2626' : colors.textMuted}
          />
          <Text style={styles.queueName} numberOfLines={1}>{item.fileName}</Text>
          <Text style={styles.queueStatus}>{item.status === 'ocr' ? 'OCR' : item.status}</Text>
          {item.status === 'failed' ? (
            <TouchableOpacity onPress={() => onRetry(item)}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {queue.length > 6 ? <Text style={styles.queueMore}>+ {queue.length - 6} more</Text> : null}
    </View>
  )
}

export default function DashboardScreen() {
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
  const [uploadQueue, setUploadQueue] = useState([])
  const [importing, setImporting] = useState(false)
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

  useEffect(() => {
    refreshBubbleState(true)
    refreshNativeScreenshotState()
  }, [refreshBubbleState, refreshNativeScreenshotState])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    load(false)
    refreshBubbleState(false)
    refreshNativeScreenshotState()
  }, [load, refreshBubbleState, refreshNativeScreenshotState])

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

  useFocusEffect(useCallback(() => {
    load(memories.length === 0)
    refreshBubbleState(false)
    refreshNativeScreenshotState()
    return undefined
  }, [load, refreshBubbleState, refreshNativeScreenshotState, memories.length]))

  async function handleBubbleCardPress() {
    if (!bubbleSupported) return
    if (!bubbleEnabled) return setSetupGuideVisible(true)
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
      Alert.alert('Enable Samhaal access first', 'Screenshot suggestions use the same Android Accessibility service as the Save Bubble.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open setup', onPress: () => setSetupGuideVisible(true) },
      ])
      return
    }
    let access = screenshotMediaAccess || await hasScreenshotMediaAccess()
    if (!access) {
      const permission = screenshotPermission()
      if (!permission) return
      const result = await PermissionsAndroid.request(permission, {
        title: 'Allow screenshot suggestions',
        message: 'Samhaal needs photo access only to notice newly created screenshots.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      })
      access = result === PermissionsAndroid.RESULTS.GRANTED
      setScreenshotMediaAccess(access)
    }
    if (!access) return Alert.alert('Photo access is required', 'You can keep using the Save Bubble without this permission.')
    setNativeScreenshotDetectionEnabled(true)
    setNativeScreenshotDetectionState(true)
  }

  async function importScreenshots() {
    if (importing) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      quality: 1,
      selectionLimit: 50,
    })
    if (result.canceled || !result.assets?.length) return
    setImporting(true)
    try {
      await processGalleryUploadQueue(result.assets, setUploadQueue)
      DeviceEventEmitter.emit('memoriesUpdated')
      await load(false)
    } finally {
      setImporting(false)
    }
  }

  async function retryUpload(item) {
    setUploadQueue((prev) => prev.map((row) => row.id === item.id ? { ...row, status: 'ocr', error: null } : row))
    try {
      const result = await retryGalleryUploadItem(item)
      setUploadQueue((prev) => prev.map((row) => row.id === item.id ? { ...row, status: result.status === 'completed' ? 'saved' : 'processing' } : row))
      await load(false)
    } catch (error) {
      setUploadQueue((prev) => prev.map((row) => row.id === item.id ? { ...row, status: 'failed', error: error?.message || 'Upload failed' } : row))
    }
  }

  function confirmDelete(memory) {
    Alert.alert(
      'Delete this memory?',
      'This removes it from Samhaal. Your original screenshot on this phone will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemory(memory.id)
              setMemories((prev) => prev.filter((item) => item.id !== memory.id))
            } catch (error) {
              Alert.alert('Could not delete memory', error?.message || 'Please try again.')
            }
          },
        },
      ],
    )
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
    } catch { setAccountEmail('') }
    setAccountVisible(true)
  }

  function confirmLogout() {
    Alert.alert('Log out of Samhaal?', 'You can sign back in anytime. Your saved memories stay in your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: async () => { setAccountVisible(false); await supabase.auth.signOut() } },
    ])
  }

  const cardData = useMemo(() => (memories.length ? memories : SAMPLE_MEMORIES), [memories])

  return (
    <View style={styles.screen}>
      <FlatList
        data={loading ? [] : cardData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MemoryCard memory={item} onOpenImage={setPreviewImageUri} onDelete={confirmDelete} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.brand}>Samhaal</Text>
                <Text style={styles.title}>Remember it.</Text>
              </View>
              <TouchableOpacity style={styles.profileButton} onPress={openAccountMenu} accessibilityLabel="Open account menu">
                <Ionicons name="person-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>Save screenshots now. Find the exact one later.</Text>

            <TouchableOpacity style={styles.uploadButton} onPress={importScreenshots} disabled={importing}>
              <Ionicons name="images-outline" size={19} color={colors.white} />
              <View style={{ flex: 1 }}>
                <Text style={styles.uploadTitle}>{importing ? 'Importing screenshots…' : 'Upload screenshots'}</Text>
                <Text style={styles.uploadCopy}>Select multiple images · OCR stays on-device</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color="#D4D4D8" />
            </TouchableOpacity>

            <UploadQueuePanel queue={uploadQueue} onRetry={retryUpload} />

            <TouchableOpacity style={[styles.bubbleCard, bubbleEnabled && bubbleVisible && styles.bubbleCardEnabled]} onPress={handleBubbleCardPress} activeOpacity={bubbleSupported ? 0.8 : 1}>
              <View style={[styles.bubblePreview, bubbleEnabled && bubbleVisible && styles.bubblePreviewEnabled]}>
                <Text style={[styles.bubbleGlyph, bubbleEnabled && bubbleVisible && styles.bubbleGlyphEnabled]}>✦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.statusRow}>
                  <Text style={styles.bubbleTitle}>Save Bubble</Text>
                  <View style={[styles.statusDot, bubbleEnabled && bubbleVisible && styles.statusDotEnabled]} />
                </View>
                <Text style={styles.bubbleCopy}>{!bubbleSupported ? 'Requires Android 11 or newer.' : !bubbleEnabled ? 'Off · enable once in Android Accessibility settings.' : bubbleVisible ? 'On · drag it anywhere; it snaps to the nearest edge.' : 'Hidden · tap here to show the bubble again.'}</Text>
              </View>
              {bubbleSupported ? <Ionicons name="chevron-forward" size={17} color={colors.textFaint} /> : null}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.nativeShotCard, nativeScreenshotDetection && screenshotMediaAccess && styles.nativeShotCardEnabled]} onPress={toggleNativeScreenshotDetection} activeOpacity={0.82}>
              <View style={styles.nativeShotIcon}><Ionicons name="scan-outline" size={20} color={colors.text} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nativeShotTitle}>Screenshot suggestions</Text>
                <Text style={styles.nativeShotCopy}>{!bubbleEnabled ? 'Enable Samhaal access first.' : nativeScreenshotDetection && screenshotMediaAccess ? 'On · after a screenshot, choose Save to Samhaal or Ignore.' : 'Off · ask before saving normal Android screenshots.'}</Text>
              </View>
              <View style={[styles.switchTrack, nativeScreenshotDetection && screenshotMediaAccess && styles.switchTrackOn]}>
                <View style={[styles.switchKnob, nativeScreenshotDetection && screenshotMediaAccess && styles.switchKnobOn]} />
              </View>
            </TouchableOpacity>

            <View style={styles.privacyRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
              <Text style={styles.privacyText}>Raw screenshots stay on your device. OCR runs on-device; only derived memory text is sent to Samhaal.</Text>
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{memories.length ? 'Your memories' : 'How memories look'}</Text>
              <Text style={styles.countText}>{memories.length ? memories.length : 'Preview'}</Text>
            </View>
          </>
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.black} style={{ marginTop: 60 }} /> : null}
        ListFooterComponent={<View style={{ height: 28 }} />}
      />

      <OverlaySetupGuide visible={setupGuideVisible} onOpenSettings={continueToSettings} onClose={dismissSetup} />

      <Modal visible={accountVisible} transparent animationType="fade" onRequestClose={() => setAccountVisible(false)}>
        <TouchableOpacity style={styles.accountBackdrop} activeOpacity={1} onPress={() => setAccountVisible(false)}>
          <TouchableOpacity style={styles.accountSheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.accountHandle} />
            <Text style={styles.accountTitle}>Your account</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>{accountEmail || 'Signed in to Samhaal'}</Text>
            <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!previewImageUri} transparent animationType="fade" onRequestClose={() => setPreviewImageUri(null)}>
        <View style={styles.imageModalBackdrop}>
          <TouchableOpacity style={styles.imageClose} onPress={() => setPreviewImageUri(null)} accessibilityLabel="Close screenshot">
            <Ionicons name="close" size={22} color={colors.white} />
          </TouchableOpacity>
          {previewImageUri ? <Image source={{ uri: previewImageUri }} style={styles.fullImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  listContent: { paddingHorizontal: 20, paddingTop: 58 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: colors.textSecondary, marginBottom: 8 },
  title: { fontSize: 34, lineHeight: 39, letterSpacing: -1.2, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 12, maxWidth: 330, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  profileButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center' },
  uploadButton: { marginTop: 24, borderRadius: 16, padding: 15, backgroundColor: colors.black, flexDirection: 'row', gap: 12, alignItems: 'center' },
  uploadTitle: { color: colors.white, fontSize: 14, fontWeight: '700' },
  uploadCopy: { color: '#D4D4D8', fontSize: 11.5, marginTop: 3 },
  queuePanel: { marginTop: 10, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 14, padding: 12, backgroundColor: colors.surface },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  queueTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  queueProgress: { marginTop: 2, fontSize: 11, color: colors.textMuted },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  queueName: { flex: 1, fontSize: 11.5, color: colors.textSecondary },
  queueStatus: { fontSize: 10.5, color: colors.textFaint, textTransform: 'capitalize' },
  retryText: { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  queueMore: { fontSize: 10.5, color: colors.textFaint, marginTop: 4 },
  bubbleCard: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface },
  bubbleCardEnabled: { borderColor: 'rgba(0,0,0,0.18)' },
  bubblePreview: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  bubblePreviewEnabled: { backgroundColor: colors.black },
  bubbleGlyph: { fontSize: 18, color: colors.text },
  bubbleGlyphEnabled: { color: colors.white },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bubbleTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D4D4D8' },
  statusDotEnabled: { backgroundColor: '#22C55E' },
  bubbleCopy: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginTop: 4 },
  nativeShotCard: { marginTop: 10, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface },
  nativeShotCardEnabled: { borderColor: 'rgba(0,0,0,0.18)' },
  nativeShotIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  nativeShotTitle: { fontSize: 13.5, color: colors.text, fontWeight: '700' },
  nativeShotCopy: { marginTop: 3, fontSize: 11.5, lineHeight: 16, color: colors.textMuted },
  switchTrack: { width: 38, height: 22, borderRadius: 11, backgroundColor: '#E4E4E7', padding: 3, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: colors.black },
  switchKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.white },
  switchKnobOn: { alignSelf: 'flex-end' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 13, paddingHorizontal: 2 },
  privacyText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.textFaint },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 34, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  countText: { fontSize: 11.5, color: colors.textFaint },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 17, padding: 17, overflow: 'hidden' },
  demoCard: { backgroundColor: '#FCFCFC' },
  thumbnailWrap: { height: 150, borderRadius: 12, overflow: 'hidden', marginBottom: 15, backgroundColor: colors.surfaceMuted },
  thumbnail: { width: '100%', height: '100%' },
  imageBadge: { position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(9,9,11,0.78)', alignItems: 'center', justifyContent: 'center' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF8F8' },
  intent: { fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: colors.textMuted },
  timeText: { fontSize: 10.5, color: colors.textFaint },
  itemName: { fontSize: 17, lineHeight: 22, letterSpacing: -0.25, fontWeight: '700', color: colors.text },
  summary: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 7 },
  category: { fontSize: 11.5, color: colors.textFaint, marginTop: 14 },
  accountBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' },
  accountSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  accountHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8', alignSelf: 'center', marginBottom: 18 },
  accountTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  accountEmail: { marginTop: 3, fontSize: 12.5, color: colors.textMuted, marginBottom: 18 },
  logoutButton: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(220,38,38,0.16)', backgroundColor: '#FFF8F8', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  imageModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  imageClose: { position: 'absolute', top: 48, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
})

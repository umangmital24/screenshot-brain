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

function MemoryCard({ memory, onOpenImage, onDelete }) {
  return (
    <View style={styles.memoryCard}>
      {memory.local_image_uri ? (
        <TouchableOpacity style={styles.imageWrap} activeOpacity={0.9} onPress={() => onOpenImage(memory.local_image_uri)}>
          <Image source={{ uri: memory.local_image_uri }} style={styles.memoryImage} resizeMode="cover" />
          <View style={styles.expandBadge}><Ionicons name="expand-outline" size={14} color={colors.white} /></View>
        </TouchableOpacity>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.intent}>{intentLabel(memory.intent || 'SAVED')}</Text>
        <View style={styles.actionsRow}>
          <Text style={styles.time}>{timeAgo(memory.last_seen || memory.created_at)}</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(memory)}>
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.memoryTitle} numberOfLines={2}>{memory.item_name || 'Saved memory'}</Text>
      {memory.summary ? <Text style={styles.memorySummary} numberOfLines={2}>{memory.summary}</Text> : null}
      <Text style={styles.memoryCategory}>{memory.category || 'Saved memory'}</Text>
    </View>
  )
}

function QueuePanel({ queue, onRetry }) {
  if (!queue.length) return null
  const saved = queue.filter((x) => x.status === 'saved').length
  const failed = queue.filter((x) => x.status === 'failed').length
  return (
    <View style={styles.queuePanel}>
      <View style={styles.queueHeader}>
        <Text style={styles.queueTitle}>Screenshot import</Text>
        <Text style={styles.queueProgress}>{saved}/{queue.length} saved{failed ? ` · ${failed} failed` : ''}</Text>
      </View>
      {queue.slice(0, 4).map((item) => (
        <View key={item.id} style={styles.queueRow}>
          <Ionicons name={item.status === 'saved' ? 'checkmark-circle' : item.status === 'failed' ? 'alert-circle-outline' : 'time-outline'} size={16} color={item.status === 'failed' ? '#DC2626' : colors.textMuted} />
          <Text style={styles.queueName} numberOfLines={1}>{item.fileName}</Text>
          <Text style={styles.queueStatus}>{item.status}</Text>
          {item.status === 'failed' ? <TouchableOpacity onPress={() => onRetry(item)}><Text style={styles.retryText}>Retry</Text></TouchableOpacity> : null}
        </View>
      ))}
    </View>
  )
}

export default function DashboardScreenV2() {
  const [memories, setMemories] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [bubbleSupported, setBubbleSupported] = useState(false)
  const [bubbleEnabled, setBubbleEnabled] = useState(false)
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [nativeShot, setNativeShot] = useState(false)
  const [mediaAccess, setMediaAccess] = useState(false)
  const [setupVisible, setSetupVisible] = useState(false)
  const [previewImageUri, setPreviewImageUri] = useState(null)
  const [accountVisible, setAccountVisible] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const [uploadQueue, setUploadQueue] = useState([])
  const [importing, setImporting] = useState(false)
  const awaitingSettingsReturn = useRef(false)

  const load = useCallback(async (full = true) => {
    if (full) setLoading(true)
    try {
      const data = await fetchMemories()
      setMemories(await attachLocalMedia(data.memories || []))
    } catch (error) {
      if (full) Alert.alert('Could not load your memories', error.message)
    } finally {
      if (full) setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const refreshBubble = useCallback(async (guide = false) => {
    const supported = await isSaveBubbleSupported()
    const enabled = supported ? await isSaveBubbleEnabled() : false
    const visible = enabled ? await isSaveBubbleVisible() : false
    setBubbleSupported(supported); setBubbleEnabled(enabled); setBubbleVisible(visible)
    if (guide && supported && !enabled && !(await AsyncStorage.getItem(SETUP_SEEN_KEY))) setSetupVisible(true)
  }, [])

  const refreshNative = useCallback(async () => {
    setNativeShot(await isNativeScreenshotDetectionEnabled())
    setMediaAccess(await hasScreenshotMediaAccess())
  }, [])

  useEffect(() => { refreshBubble(true); refreshNative() }, [refreshBubble, refreshNative])
  useFocusEffect(useCallback(() => { load(memories.length === 0); refreshBubble(false); refreshNative() }, [load, refreshBubble, refreshNative, memories.length]))
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('memoriesUpdated', () => load(false))
    return () => sub.remove()
  }, [load])
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return
      load(false); await refreshBubble(false); await refreshNative()
      if (awaitingSettingsReturn.current) { awaitingSettingsReturn.current = false; if (await isSaveBubbleEnabled()) setSetupVisible(false) }
    })
    return () => sub.remove()
  }, [load, refreshBubble, refreshNative])

  async function importScreenshots() {
    if (importing) return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, orderedSelection: true, quality: 1, selectionLimit: 50 })
    if (result.canceled || !result.assets?.length) return
    setImporting(true)
    try { await processGalleryUploadQueue(result.assets, setUploadQueue); DeviceEventEmitter.emit('memoriesUpdated'); await load(false) }
    finally { setImporting(false) }
  }

  async function retryUpload(item) {
    setUploadQueue((prev) => prev.map((x) => x.id === item.id ? { ...x, status: 'ocr', error: null } : x))
    try {
      const result = await retryGalleryUploadItem(item)
      setUploadQueue((prev) => prev.map((x) => x.id === item.id ? { ...x, status: result.status === 'completed' ? 'saved' : 'processing' } : x))
      await load(false)
    } catch (error) {
      setUploadQueue((prev) => prev.map((x) => x.id === item.id ? { ...x, status: 'failed', error: error.message } : x))
    }
  }

  async function handleBubble() {
    if (!bubbleSupported) return
    if (!bubbleEnabled) return setSetupVisible(true)
    if (!bubbleVisible) { showSaveBubble(); setTimeout(() => refreshBubble(false), 150); return }
    setSetupVisible(true)
  }

  async function toggleScreenshotSuggestions() {
    if (!bubbleEnabled) return setSetupVisible(true)
    if (nativeShot) { setNativeScreenshotDetectionEnabled(false); setNativeShot(false); return }
    let access = mediaAccess || await hasScreenshotMediaAccess()
    if (!access) {
      const permission = screenshotPermission()
      const result = await PermissionsAndroid.request(permission, { title: 'Allow screenshot suggestions', message: 'Samhaal needs photo access only to notice newly created screenshots.', buttonPositive: 'Allow', buttonNegative: 'Not now' })
      access = result === PermissionsAndroid.RESULTS.GRANTED
      setMediaAccess(access)
    }
    if (!access) return
    setNativeScreenshotDetectionEnabled(true); setNativeShot(true)
  }

  function confirmDelete(memory) {
    Alert.alert('Delete this memory?', 'This removes it from Samhaal. Your original screenshot on this phone will not be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteMemory(memory.id); setMemories((prev) => prev.filter((x) => x.id !== memory.id)) } catch (error) { Alert.alert('Could not delete memory', error.message) } } },
    ])
  }

  async function openAccount() {
    try { const { data } = await supabase.auth.getUser(); setAccountEmail(data?.user?.email || '') } catch { setAccountEmail('') }
    setAccountVisible(true)
  }

  const data = useMemo(() => memories, [memories])

  return (
    <View style={styles.screen}>
      <FlatList
        data={loading ? [] : data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <MemoryCard memory={item} onOpenImage={setPreviewImageUri} onDelete={confirmDelete} />}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); load(false); refreshBubble(false); refreshNative() }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View>
                <View style={styles.brandRow}><Text style={styles.brand}>Samhaal</Text><Text style={styles.hindi}>संभाल</Text></View>
                <Text style={styles.title}>Remember it.</Text>
              </View>
              <TouchableOpacity style={styles.profile} onPress={openAccount}><Ionicons name="person-outline" size={22} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>Save screenshots now. Find the exact one later.</Text>

            <TouchableOpacity style={styles.uploadButton} onPress={importScreenshots} disabled={importing} activeOpacity={0.86}>
              <View style={styles.uploadIcon}><Ionicons name="images-outline" size={22} color={colors.white} /></View>
              <View style={{ flex: 1 }}><Text style={styles.uploadTitle}>{importing ? 'Importing screenshots…' : 'Upload screenshots'}</Text><Text style={styles.uploadCopy}>Select multiple images · OCR stays on-device</Text></View>
              <Ionicons name="chevron-forward" size={22} color="#D4D4D8" />
            </TouchableOpacity>

            <QueuePanel queue={uploadQueue} onRetry={retryUpload} />

            <TouchableOpacity style={styles.actionCard} onPress={handleBubble} activeOpacity={0.86}>
              <View style={styles.roundIcon}><Ionicons name="sparkles" size={20} color={colors.text} /></View>
              <View style={{ flex: 1 }}><View style={styles.actionTitleRow}><Text style={styles.actionTitle}>Save Bubble</Text><View style={[styles.dot, bubbleEnabled && bubbleVisible && styles.dotOn]} /></View><Text style={styles.actionCopy}>{!bubbleEnabled ? 'Off · enable once in Android Accessibility settings.' : bubbleVisible ? 'On · tap the bubble anywhere to save.' : 'Hidden · tap here to show it again.'}</Text></View>
              <Ionicons name="chevron-forward" size={21} color={colors.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={toggleScreenshotSuggestions} activeOpacity={0.86}>
              <View style={styles.squareIcon}><Ionicons name="scan-outline" size={21} color={colors.text} /></View>
              <View style={{ flex: 1 }}><Text style={styles.actionTitle}>Screenshot suggestions</Text><Text style={styles.actionCopy}>{!bubbleEnabled ? 'Enable Samhaal access first.' : nativeShot && mediaAccess ? 'On · choose Save to Samhaal or Ignore after a screenshot.' : 'Off · ask before saving normal screenshots.'}</Text></View>
              <View style={[styles.switchTrack, nativeShot && mediaAccess && styles.switchTrackOn]}><View style={[styles.switchKnob, nativeShot && mediaAccess && styles.switchKnobOn]} /></View>
            </TouchableOpacity>

            <View style={styles.privacyRow}><Ionicons name="shield-checkmark-outline" size={17} color={colors.textMuted} /><Text style={styles.privacyText}>Raw screenshots stay on your device. OCR runs on-device; only derived memory text is sent to Samhaal.</Text></View>
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Your memories</Text><Text style={styles.count}>{memories.length}</Text></View>
          </>
        }
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.black} style={{ marginTop: 64 }} /> : <View style={styles.empty}><Text style={styles.emptyTitle}>No memories yet.</Text><Text style={styles.emptyCopy}>Take a screenshot, use the Save Bubble, or upload existing screenshots.</Text></View>}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />

      <OverlaySetupGuide visible={setupVisible} onOpenSettings={async () => { await AsyncStorage.setItem(SETUP_SEEN_KEY, 'true'); awaitingSettingsReturn.current = true; openAccessibilitySettings() }} onClose={async () => { await AsyncStorage.setItem(SETUP_SEEN_KEY, 'true'); setSetupVisible(false) }} />

      <Modal visible={accountVisible} transparent animationType="fade" onRequestClose={() => setAccountVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setAccountVisible(false)}><View style={styles.sheet}><View style={styles.handle} /><Text style={styles.sheetTitle}>Your account</Text><Text style={styles.sheetEmail}>{accountEmail || 'Signed in to Samhaal'}</Text><TouchableOpacity style={styles.logout} onPress={async () => { setAccountVisible(false); await supabase.auth.signOut() }}><Ionicons name="log-out-outline" size={18} color="#DC2626" /><Text style={styles.logoutText}>Log out</Text></TouchableOpacity></View></TouchableOpacity>
      </Modal>

      <Modal visible={Boolean(previewImageUri)} transparent animationType="fade" onRequestClose={() => setPreviewImageUri(null)}>
        <View style={styles.imageBackdrop}><TouchableOpacity style={styles.closeImage} onPress={() => setPreviewImageUri(null)}><Ionicons name="close" size={24} color={colors.white} /></TouchableOpacity>{previewImageUri ? <Image source={{ uri: previewImageUri }} style={styles.fullImage} resizeMode="contain" /> : null}</View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  listContent: { paddingHorizontal: 20, paddingTop: 54 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginBottom: 8 },
  brand: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  hindi: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  title: { fontSize: 37, lineHeight: 42, letterSpacing: -1.3, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 11, fontSize: 15, lineHeight: 22, color: colors.textMuted, maxWidth: 330 },
  profile: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  uploadButton: { marginTop: 26, borderRadius: 18, padding: 16, backgroundColor: colors.black, flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 82 },
  uploadIcon: { width: 34, alignItems: 'center' },
  uploadTitle: { color: colors.white, fontSize: 16, fontWeight: '700' },
  uploadCopy: { color: '#C9CAD0', fontSize: 12.5, marginTop: 4 },
  queuePanel: { marginTop: 10, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 16, padding: 13 },
  queueHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  queueTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  queueProgress: { fontSize: 11, color: colors.textMuted },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  queueName: { flex: 1, fontSize: 11.5, color: colors.textSecondary },
  queueStatus: { fontSize: 10.5, color: colors.textFaint, textTransform: 'capitalize' },
  retryText: { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  actionCard: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, minHeight: 82 },
  roundIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  squareIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  actionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  actionCopy: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D4D4D8' },
  dotOn: { backgroundColor: colors.black },
  switchTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#E4E4E7', padding: 3, justifyContent: 'center' },
  switchTrackOn: { backgroundColor: colors.black },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.white },
  switchKnobOn: { alignSelf: 'flex-end' },
  privacyRow: { marginTop: 15, flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 2 },
  privacyText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.textFaint },
  sectionRow: { marginTop: 34, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  count: { fontSize: 12, color: colors.textFaint },
  memoryCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 18, padding: 16, overflow: 'hidden' },
  imageWrap: { height: 170, borderRadius: 14, overflow: 'hidden', marginBottom: 14, backgroundColor: colors.surfaceMuted },
  memoryImage: { width: '100%', height: '100%' },
  expandBadge: { position: 'absolute', right: 9, bottom: 9, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(9,9,11,0.82)', alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  intent: { fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: colors.textMuted },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  time: { fontSize: 10.5, color: colors.textFaint },
  deleteButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFF8F8', alignItems: 'center', justifyContent: 'center' },
  memoryTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  memorySummary: { marginTop: 6, fontSize: 13.5, lineHeight: 19, color: colors.textMuted },
  memoryCategory: { marginTop: 12, fontSize: 11.5, color: colors.textFaint },
  empty: { paddingVertical: 44, alignItems: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptyCopy: { maxWidth: 280, textAlign: 'center', marginTop: 7, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8', alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  sheetEmail: { marginTop: 4, fontSize: 13, color: colors.textMuted, marginBottom: 18 },
  logout: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(220,38,38,0.14)', borderRadius: 13, backgroundColor: '#FFF8F8', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  imageBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center' },
  closeImage: { position: 'absolute', top: 48, right: 18, zIndex: 2, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '82%' },
})

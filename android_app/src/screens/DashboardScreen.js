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
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../supabaseClient'
import { fetchMemories } from '../api'
import { attachLocalMedia } from '../localMemoryMedia'
import { colors, intentLabel, timeAgo } from '../theme'
import OverlaySetupGuide from '../components/OverlaySetupGuide'
import {
  isSaveBubbleEnabled,
  isSaveBubbleSupported,
  isSaveBubbleVisible,
  openAccessibilitySettings,
  showSaveBubble,
} from '../saveBubble'

const SETUP_SEEN_KEY = 'samhaalSaveBubbleGuideSeen'

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
  {
    id: 'sample-3',
    intent: 'READ_LATER',
    item_name: 'Designing Data-Intensive Applications',
    summary: 'Book recommendation saved to come back to later.',
    category: 'Books',
    last_seen: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    frequency: 1,
    demo: true,
  },
]

function MemoryCard({ memory, onOpenImage }) {
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
        <Text style={styles.timeText}>{memory.demo ? 'Example' : timeAgo(memory.last_seen)}</Text>
      </View>
      <Text style={styles.itemName}>{memory.item_name}</Text>
      {memory.summary ? <Text style={styles.summary}>{memory.summary}</Text> : null}
      <Text style={styles.category}>{memory.category || 'Saved memory'}</Text>
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
  const [setupGuideVisible, setSetupGuideVisible] = useState(false)
  const [previewImageUri, setPreviewImageUri] = useState(null)
  const [accountVisible, setAccountVisible] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const awaitingSettingsReturn = useRef(false)

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

  useEffect(() => {
    refreshBubbleState(true)
  }, [refreshBubbleState])

  const load = useCallback(async (showFullLoader = true) => {
    if (showFullLoader) setLoading(true)
    try {
      const data = await fetchMemories()
      const withLocalMedia = await attachLocalMedia(data.memories || [])
      setMemories(withLocalMedia)
    } catch (err) {
      if (showFullLoader) {
        Alert.alert('Could not load your memories', err.message)
      } else {
        console.warn('Silent refresh failed:', err.message)
      }
    } finally {
      if (showFullLoader) setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    load(false)
    refreshBubbleState(false)
  }, [load, refreshBubbleState])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return
      load(false)
      await refreshBubbleState(false)
      if (awaitingSettingsReturn.current) {
        awaitingSettingsReturn.current = false
        const enabled = await isSaveBubbleEnabled()
        if (enabled) setSetupGuideVisible(false)
      }
    })
    return () => sub.remove()
  }, [load, refreshBubbleState])

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('memoriesUpdated', () => {
      load(false)
    })
    return () => sub.remove()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      load(memories.length === 0)
      refreshBubbleState(false)
      return undefined
    }, [load, refreshBubbleState, memories.length])
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

  const cardData = useMemo(() => (memories.length ? memories : SAMPLE_MEMORIES), [memories])

  return (
    <View style={styles.screen}>
      <FlatList
        data={loading ? [] : cardData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MemoryCard memory={item} onOpenImage={setPreviewImageUri} />}
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

            <Text style={styles.subtitle}>Tap the Save Bubble anywhere. Samhaal turns that screen into something you can find later.</Text>

            <TouchableOpacity
              style={[styles.bubbleCard, bubbleEnabled && bubbleVisible && styles.bubbleCardEnabled]}
              onPress={handleBubbleCardPress}
              activeOpacity={bubbleSupported ? 0.8 : 1}
            >
              <View style={[styles.bubblePreview, bubbleEnabled && bubbleVisible && styles.bubblePreviewEnabled]}>
                <Text style={[styles.bubbleGlyph, bubbleEnabled && bubbleVisible && styles.bubbleGlyphEnabled]}>✦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.statusRow}>
                  <Text style={styles.bubbleTitle}>Save Bubble</Text>
                  <View style={[styles.statusDot, bubbleEnabled && bubbleVisible && styles.statusDotEnabled]} />
                </View>
                <Text style={styles.bubbleCopy}>
                  {!bubbleSupported
                    ? 'Requires Android 11 or newer.'
                    : !bubbleEnabled
                      ? 'Off · enable once in Android Accessibility settings.'
                      : bubbleVisible
                        ? 'On · drag it anywhere; it snaps to the nearest edge.'
                        : 'Hidden · tap here to show the bubble again.'}
                </Text>
              </View>
              {bubbleSupported ? <Ionicons name="chevron-forward" size={17} color={colors.textFaint} /> : null}
            </TouchableOpacity>

            <View style={styles.privacyRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
              <Text style={styles.privacyText}>A private screenshot reference stays on this device. Only OCR text is sent to Samhaal.</Text>
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{memories.length ? 'Your memories' : 'How memories look'}</Text>
              {memories.length ? <Text style={styles.countText}>{memories.length}</Text> : <Text style={styles.countText}>Preview</Text>}
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
            <View style={styles.accountHeaderRow}>
              <View style={styles.accountAvatar}>
                <Ionicons name="person-outline" size={20} color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountTitle}>Your account</Text>
                <Text style={styles.accountEmail} numberOfLines={1}>{accountEmail || 'Signed in to Samhaal'}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>

            <Text style={styles.accountHint}>Logging out does not delete your saved memories.</Text>
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
  bubbleCard: { marginTop: 26, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface },
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
  intent: { fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: colors.textMuted },
  timeText: { fontSize: 10.5, color: colors.textFaint },
  itemName: { fontSize: 17, lineHeight: 22, letterSpacing: -0.25, fontWeight: '700', color: colors.text },
  summary: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 7 },
  category: { fontSize: 11.5, color: colors.textFaint, marginTop: 14 },
  accountBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' },
  accountSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  accountHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8', alignSelf: 'center', marginBottom: 18 },
  accountHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  accountAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  accountTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  accountEmail: { marginTop: 3, fontSize: 12.5, color: colors.textMuted },
  logoutButton: { minHeight: 48, borderWidth: 1, borderColor: 'rgba(220,38,38,0.16)', backgroundColor: '#FFF8F8', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  accountHint: { marginTop: 10, fontSize: 10.5, color: colors.textFaint, textAlign: 'center' },
  imageModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  imageClose: { position: 'absolute', top: 48, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
})

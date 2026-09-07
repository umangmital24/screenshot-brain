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
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../supabaseClient'
import { fetchMemories } from '../api'
import { colors, intentLabel, timeAgo } from '../theme'
import OverlaySetupGuide from '../components/OverlaySetupGuide'
import { isSaveBubbleEnabled, isSaveBubbleSupported, openAccessibilitySettings } from '../saveBubble'

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

function MemoryCard({ memory }) {
  return (
    <View style={[styles.card, memory.demo && styles.demoCard]}>
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
  const [setupGuideVisible, setSetupGuideVisible] = useState(false)
  const awaitingSettingsReturn = useRef(false)

  const refreshBubbleState = useCallback(async (allowAutoGuide = false) => {
    const supported = await isSaveBubbleSupported()
    const enabled = supported ? await isSaveBubbleEnabled() : false
    setBubbleSupported(supported)
    setBubbleEnabled(enabled)

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
      setMemories(data.memories || [])
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

  // Auto-refresh when returning to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return
      load(false)
      const enabled = await isSaveBubbleEnabled()
      setBubbleEnabled(enabled)
      if (awaitingSettingsReturn.current) {
        awaitingSettingsReturn.current = false
        if (enabled) setSetupGuideVisible(false)
      }
    })
    return () => sub.remove()
  }, [load])

  // Auto-refresh when SaveBubble or ShareIntent finishes processing
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('memoriesUpdated', () => {
      load(false)
    })
    return () => sub.remove()
  }, [load])

  // Polling every 8s while on the screen to catch background saves automatically
  useFocusEffect(
    useCallback(() => {
      load(memories.length === 0)
      refreshBubbleState(false)
      const interval = setInterval(() => {
        load(false)
      }, 8000)
      return () => clearInterval(interval)
    }, [load, refreshBubbleState, memories.length])
  )

  function openSetup() {
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

  const cardData = useMemo(() => (memories.length ? memories : SAMPLE_MEMORIES), [memories])

  return (
    <View style={styles.screen}>
      <FlatList
        data={loading ? [] : cardData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MemoryCard memory={item} />}
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
              <TouchableOpacity style={styles.profileButton} onPress={() => supabase.auth.signOut()} accessibilityLabel="Sign out">
                <Ionicons name="person-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>Tap the Save Bubble anywhere. Samhaal turns that screen into something you can find later.</Text>

            <TouchableOpacity
              style={[styles.bubbleCard, bubbleEnabled && styles.bubbleCardEnabled]}
              onPress={bubbleSupported ? openSetup : undefined}
              activeOpacity={bubbleSupported ? 0.8 : 1}
            >
              <View style={[styles.bubblePreview, bubbleEnabled && styles.bubblePreviewEnabled]}>
                <Text style={[styles.bubbleGlyph, bubbleEnabled && styles.bubbleGlyphEnabled]}>✦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.statusRow}>
                  <Text style={styles.bubbleTitle}>Save Bubble</Text>
                  <View style={[styles.statusDot, bubbleEnabled && styles.statusDotEnabled]} />
                </View>
                <Text style={styles.bubbleCopy}>
                  {!bubbleSupported
                    ? 'Requires Android 11 or newer.'
                    : bubbleEnabled
                      ? 'On · drag it to any edge and tap to save the current screen.'
                      : 'Off · enable once in Android Accessibility settings.'}
                </Text>
              </View>
              {bubbleSupported ? <Ionicons name="chevron-forward" size={17} color={colors.textFaint} /> : null}
            </TouchableOpacity>

            <View style={styles.privacyRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
              <Text style={styles.privacyText}>Captured pixels stay on device. Only OCR text is sent to Samhaal.</Text>
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
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 17, padding: 17 },
  demoCard: { backgroundColor: '#FCFCFC' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  intent: { fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: colors.textMuted },
  timeText: { fontSize: 10.5, color: colors.textFaint },
  itemName: { fontSize: 17, lineHeight: 22, letterSpacing: -0.25, fontWeight: '700', color: colors.text },
  summary: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 7 },
  category: { fontSize: 11.5, color: colors.textFaint, marginTop: 14 },
})

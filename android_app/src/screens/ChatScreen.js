import { useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { askChat } from '../api'
import { attachLocalMediaToSources } from '../localMemoryMedia'
import { colors } from '../theme'

const SUGGESTIONS = [
  'black wedding suit',
  'AI job I saved',
  'restaurant from last weekend',
  'movie poster with a robot',
]

const CASUAL = /^(hi|hello|hey|thanks|thank you|okay|ok|cool|good morning|good evening)[!.\s]*$/i

function cleanAssistantText(value) {
  if (!value) return ''
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function ordinalIndex(text) {
  const value = String(text || '').toLowerCase()
  if (/\b(first|1st|one)\b/.test(value)) return 0
  if (/\b(second|2nd|two)\b/.test(value)) return 1
  if (/\b(third|3rd|three)\b/.test(value)) return 2
  if (/\b(fourth|4th|four)\b/.test(value)) return 3
  return null
}

function ResultCard({ source, onOpen }) {
  const canOpen = Boolean(source.local_image_uri)
  return (
    <TouchableOpacity style={styles.resultCard} activeOpacity={0.86} onPress={canOpen ? () => onOpen(source) : undefined}>
      {canOpen ? (
        <Image source={{ uri: source.local_image_uri }} style={styles.resultImage} resizeMode="cover" />
      ) : (
        <View style={[styles.resultImage, styles.resultPlaceholder]}>
          <Ionicons name="image-outline" size={22} color={colors.textFaint} />
        </View>
      )}
      <Text style={styles.resultName} numberOfLines={2}>{source.item_name || 'Saved memory'}</Text>
      <Text style={styles.resultMeta} numberOfLines={1}>{source.category || source.intent || 'Memory'}</Text>
      <View style={styles.openRow}>
        <Text style={styles.openText}>{canOpen ? 'Open screenshot' : 'Screenshot unavailable'}</Text>
        {canOpen ? <Ionicons name="arrow-forward" size={13} color={colors.textSecondary} /> : null}
      </View>
    </TouchableOpacity>
  )
}

export default function ChatScreen() {
  const [query, setQuery] = useState('')
  const [log, setLog] = useState([])
  const [searching, setSearching] = useState(false)
  const [previewSource, setPreviewSource] = useState(null)
  const listRef = useRef(null)

  const lastSources = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i -= 1) {
      if (log[i]?.type === 'result' && log[i]?.sources?.length) return log[i].sources
    }
    return []
  }, [log])

  function recentHistory() {
    return log
      .filter((item) => (item.type === 'user' || item.type === 'result') && item.text)
      .slice(-8)
      .map((item) => ({ role: item.type === 'user' ? 'user' : 'assistant', text: item.text }))
  }

  async function runSearch(prefilled) {
    const q = (typeof prefilled === 'string' ? prefilled : query).trim()
    if (!q || searching) return
    setQuery('')
    setLog((prev) => [...prev, { type: 'user', text: q }])

    if (CASUAL.test(q)) {
      setLog((prev) => [...prev, { type: 'result', text: 'Hi! What are you looking for?', sources: [] }])
      return
    }

    const ordinal = ordinalIndex(q)
    if (ordinal !== null && /\b(open|show|this|that|one)\b/i.test(q) && lastSources[ordinal]) {
      setPreviewSource(lastSources[ordinal])
      setLog((prev) => [...prev, { type: 'result', text: `Opening ${lastSources[ordinal].item_name || 'that memory'}.`, sources: [lastSources[ordinal]] }])
      return
    }

    setSearching(true)
    try {
      const data = await askChat(q, recentHistory())
      const sources = await attachLocalMediaToSources(data.sources || [])
      setLog((prev) => [...prev, {
        type: 'result',
        text: cleanAssistantText(data.answer) || (sources.length ? `Found ${sources.length} matching memories.` : "I couldn't find a matching saved memory."),
        sources,
      }])
    } catch (error) {
      setLog((prev) => [...prev, { type: 'result', text: `I couldn't search your memories right now. ${error.message}`, sources: [], error: true }])
    } finally {
      setSearching(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <View style={styles.header}>
        <Text style={styles.brand}>Samhaal</Text>
        <Text style={styles.title}>Search your memories</Text>
        <Text style={styles.subtitle}>Describe what you remember. Samhaal finds the screenshot you saved.</Text>
      </View>

      <FlatList
        ref={listRef}
        data={log}
        keyExtractor={(_, index) => String(index)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.messages, log.length === 0 && { flexGrow: 1 }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.askIcon}><Ionicons name="search-outline" size={22} color={colors.text} /></View>
            <Text style={styles.emptyTitle}>Find what you saved</Text>
            <Text style={styles.emptyCopy}>You don't need the exact title, filename, or date.</Text>
            <View style={styles.suggestionList}>
              {SUGGESTIONS.map((suggestion) => (
                <TouchableOpacity key={suggestion} style={styles.suggestion} onPress={() => runSearch(suggestion)}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                  <Ionicons name="arrow-up-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'user') {
            return <View style={styles.userRow}><View style={styles.userBubble}><Text style={styles.userText}>{item.text}</Text></View></View>
          }
          return (
            <View style={styles.resultGroup}>
              <View style={[styles.answerBubble, item.error && styles.errorBubble]}>
                <Text style={styles.answerText}>{item.text}</Text>
              </View>
              {item.sources?.length ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resultStrip}>
                    {item.sources.map((source, index) => (
                      <ResultCard key={source.memory_id || `${source.item_name}-${index}`} source={source} onOpen={setPreviewSource} />
                    ))}
                  </ScrollView>
                  <View style={styles.chipRow}>
                    <TouchableOpacity style={styles.chip} onPress={() => runSearch('show more like these')}><Text style={styles.chipText}>Show more</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.chip} onPress={() => runSearch('show only recent matches')}><Text style={styles.chipText}>Recent</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.chip} onPress={() => setPreviewSource(item.sources[0])}><Text style={styles.chipText}>Open first</Text></TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          )
        }}
        ListFooterComponent={searching ? (
          <View style={styles.searchState}><ActivityIndicator color={colors.black} /><Text style={styles.searchStateText}>Searching your memories…</Text></View>
        ) : null}
      />

      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Describe what you remember…"
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch()}
            returnKeyType="search"
            multiline
            maxLength={1000}
          />
          <TouchableOpacity style={[styles.sendButton, (!query.trim() || searching) && styles.sendButtonDisabled]} onPress={() => runSearch()} disabled={!query.trim() || searching}>
            <Ionicons name="search" size={17} color={colors.white} />
          </TouchableOpacity>
        </View>
        <Text style={styles.footerNote}>Samhaal retrieves saved memories; it doesn't recommend or judge them.</Text>
      </View>

      <Modal visible={Boolean(previewSource)} transparent animationType="fade" onRequestClose={() => setPreviewSource(null)}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewEyebrow}>Saved screenshot</Text>
              <Text style={styles.previewTitle} numberOfLines={2}>{previewSource?.item_name || 'Samhaal memory'}</Text>
            </View>
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewSource(null)}><Ionicons name="close" size={23} color={colors.white} /></TouchableOpacity>
          </View>
          {previewSource?.local_image_uri ? <Image source={{ uri: previewSource.local_image_uri }} style={styles.previewImage} resizeMode="contain" /> : (
            <View style={styles.missingPreview}><Ionicons name="image-outline" size={32} color="#8E8E93" /><Text style={styles.missingText}>Original screenshot is no longer available on this device.</Text></View>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 18, paddingTop: 58, paddingBottom: 14 },
  brand: { fontSize: 12, color: colors.textMuted, fontWeight: '700', marginBottom: 8 },
  title: { fontSize: 31, lineHeight: 37, letterSpacing: -0.9, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 6, lineHeight: 20, maxWidth: 350 },
  messages: { paddingHorizontal: 18, paddingBottom: 16 },
  emptyState: { flex: 1, justifyContent: 'center', paddingBottom: 24 },
  askIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, color: colors.text, fontWeight: '700' },
  emptyCopy: { fontSize: 13, color: colors.textMuted, marginTop: 5, lineHeight: 18 },
  suggestionList: { marginTop: 20, gap: 8 },
  suggestion: { minHeight: 48, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  suggestionText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  userRow: { alignItems: 'flex-end', marginTop: 12, marginBottom: 6 },
  userBubble: { backgroundColor: colors.black, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 10, maxWidth: '84%' },
  userText: { color: colors.white, fontSize: 14, lineHeight: 20 },
  resultGroup: { marginTop: 6, marginBottom: 12 },
  answerBubble: { borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, borderRadius: 13, padding: 13 },
  errorBubble: { borderColor: 'rgba(220,38,38,0.18)', backgroundColor: '#FFF8F8' },
  answerText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  resultStrip: { gap: 10, paddingTop: 10, paddingBottom: 3 },
  resultCard: { width: 178, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 14, padding: 9, backgroundColor: colors.surface },
  resultImage: { width: '100%', height: 130, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  resultPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  resultName: { marginTop: 9, fontSize: 12.5, lineHeight: 17, color: colors.text, fontWeight: '700' },
  resultMeta: { marginTop: 3, fontSize: 10.5, color: colors.textFaint },
  openRow: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  openText: { fontSize: 10.5, color: colors.textSecondary, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  chip: { borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface },
  chipText: { fontSize: 11.5, color: colors.textSecondary, fontWeight: '600' },
  searchState: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, marginVertical: 18 },
  searchStateText: { fontSize: 12, color: colors.textMuted },
  composerWrap: { borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 10 : 8, backgroundColor: colors.surface },
  composer: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 14, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 13, paddingRight: 5, paddingVertical: 5, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 110, minHeight: 36, color: colors.text, fontSize: 14, lineHeight: 20, paddingTop: 8, paddingBottom: 7, paddingRight: 8 },
  sendButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.32 },
  footerNote: { fontSize: 10.5, color: colors.textFaint, textAlign: 'center', marginTop: 6 },
  previewBackdrop: { flex: 1, backgroundColor: '#080808', paddingTop: Platform.OS === 'ios' ? 54 : 34, paddingBottom: 24 },
  previewTopRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingBottom: 12 },
  previewEyebrow: { color: '#9A9AA0', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  previewTitle: { color: colors.white, fontSize: 16, lineHeight: 21, fontWeight: '700', marginTop: 2 },
  previewClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#242426', alignItems: 'center', justifyContent: 'center' },
  previewImage: { flex: 1, width: '100%' },
  missingPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  missingText: { marginTop: 10, color: '#A7A7AC', fontSize: 12, textAlign: 'center' },
})

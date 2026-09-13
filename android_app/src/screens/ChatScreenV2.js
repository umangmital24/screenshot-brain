import { useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Modal, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { askChat, deleteMemory } from '../api'
import { attachLocalMediaToSources, removeLocalMemoryReference } from '../localMemoryMedia'
import { colors } from '../theme'

const SUGGESTIONS = ['black wedding suit', 'AI job I saved', 'restaurant from last weekend', 'movie poster with a robot']
const CASUAL = /^(hi|hello|hey|thanks|thank you|okay|ok|cool|good morning|good evening)[!.\s]*$/i

function clean(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/^\s*[*-]\s+/gm, '• ').replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/#{1,6}\s*/g, '').trim()
}

function SourceCard({ source, onOpen, onDelete }) {
  const canOpen = Boolean(source.local_image_uri)
  return (
    <TouchableOpacity style={styles.sourceCard} activeOpacity={canOpen ? 0.88 : 1} onPress={canOpen ? () => onOpen(source) : undefined}>
      {canOpen ? <Image source={{ uri: source.local_image_uri }} style={styles.sourceImage} resizeMode="cover" /> : <View style={[styles.sourceImage, styles.placeholder]}><Ionicons name="image-outline" size={22} color={colors.textFaint} /></View>}
      <View style={styles.sourceBody}>
        <View style={styles.sourceTop}><View style={{ flex: 1 }}><Text style={styles.sourceTitle} numberOfLines={2}>{source.item_name || 'Saved memory'}</Text><Text style={styles.sourceMeta} numberOfLines={1}>{source.category || source.intent || 'Memory'}</Text></View><TouchableOpacity style={styles.delete} onPress={() => onDelete(source)}><Ionicons name="trash-outline" size={15} color="#DC2626" /></TouchableOpacity></View>
        <Text style={styles.openText}>{canOpen ? 'View original screenshot' : 'Original unavailable'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
    </TouchableOpacity>
  )
}

export default function ChatScreenV2() {
  const [query, setQuery] = useState('')
  const [log, setLog] = useState([])
  const [searching, setSearching] = useState(false)
  const [preview, setPreview] = useState(null)
  const listRef = useRef(null)

  const lastSources = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i -= 1) if (log[i]?.type === 'result' && log[i]?.sources?.length) return log[i].sources
    return []
  }, [log])

  async function runSearch(prefilled) {
    const raw = (typeof prefilled === 'string' ? prefilled : query).trim()
    if (!raw || searching) return
    setQuery('')
    setLog((prev) => [...prev, { type: 'user', text: raw }])
    if (CASUAL.test(raw)) { setLog((prev) => [...prev, { type: 'result', text: 'What are you trying to find from your saved memories?', sources: [] }]); return }
    setSearching(true)
    try {
      const data = await askChat(raw, [])
      const sources = await attachLocalMediaToSources(data.sources || [])
      setLog((prev) => [...prev, { type: 'result', text: clean(data.answer) || (sources.length ? `Found ${sources.length} relevant memories.` : "I couldn't find a matching saved memory."), sources }])
    } catch (error) {
      setLog((prev) => [...prev, { type: 'result', text: `I couldn't search your memories right now. ${error.message}`, sources: [], error: true }])
    } finally {
      setSearching(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)
    }
  }

  function confirmDelete(source) {
    Alert.alert('Delete this memory?', 'This removes it from Samhaal. The original screenshot on your phone will not be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteMemory(source.memory_id); await removeLocalMemoryReference(source.memory_id); setLog((prev) => prev.map((x) => x.type === 'result' ? { ...x, sources: (x.sources || []).filter((row) => row.memory_id !== source.memory_id) } : x)); if (preview?.memory_id === source.memory_id) setPreview(null) } catch (error) { Alert.alert('Could not delete memory', error.message) } } },
    ])
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <View style={styles.header}>
        <View style={styles.brandRow}><Text style={styles.brand}>Samhaal</Text><Text style={styles.hindi}>संभाल</Text></View>
        <Text style={styles.title}>Ask your memory</Text>
        <Text style={styles.subtitle}>Describe what you remember. Samhaal finds the screenshot you saved.</Text>
      </View>

      <FlatList ref={listRef} data={log} keyExtractor={(_, i) => String(i)} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.messages, log.length === 0 && { flexGrow: 1 }]}
        ListEmptyComponent={<View style={styles.empty}><View style={styles.searchIcon}><Ionicons name="search-outline" size={28} color={colors.text} /></View><Text style={styles.emptyTitle}>Find what you saved</Text><Text style={styles.emptyCopy}>You don't need the exact title, filename, or date.</Text><View style={styles.suggestions}>{SUGGESTIONS.map((s) => <TouchableOpacity key={s} style={styles.suggestion} onPress={() => runSearch(s)}><Text style={styles.suggestionText}>{s}</Text><Text style={styles.qmark}>?</Text></TouchableOpacity>)}</View></View>}
        renderItem={({ item }) => item.type === 'user' ? <View style={styles.userRow}><View style={styles.userBubble}><Text style={styles.userText}>{item.text}</Text></View></View> : <View style={styles.resultGroup}><View style={[styles.answerBubble, item.error && styles.errorBubble]}><Text style={styles.answerText}>{item.text}</Text></View>{item.sources?.length ? <><Text style={styles.fromLabel}>FROM YOUR MEMORIES</Text>{item.sources.map((source, idx) => <SourceCard key={source.memory_id || idx} source={source} onOpen={setPreview} onDelete={confirmDelete} />)}</> : null}</View>}
        ListFooterComponent={searching ? <View style={styles.searching}><ActivityIndicator color={colors.black} /><Text style={styles.searchingText}>Searching your memories…</Text></View> : null}
      />

      <View style={styles.composerWrap}>
        <View style={styles.composer}><TextInput style={styles.input} placeholder="Describe what you remember…" placeholderTextColor={colors.textFaint} value={query} onChangeText={setQuery} onSubmitEditing={() => runSearch()} returnKeyType="search" multiline maxLength={1000} /><TouchableOpacity style={[styles.send, (!query.trim() || searching) && styles.sendDisabled]} onPress={() => runSearch()} disabled={!query.trim() || searching}><Ionicons name="arrow-up" size={22} color={colors.white} /></TouchableOpacity></View>
        <Text style={styles.footer}>Answers are grounded in your saved Samhaal memories.</Text>
      </View>

      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}><View style={styles.previewBackdrop}><TouchableOpacity style={styles.previewClose} onPress={() => setPreview(null)}><Ionicons name="close" size={24} color={colors.white} /></TouchableOpacity>{preview?.local_image_uri ? <Image source={{ uri: preview.local_image_uri }} style={styles.previewImage} resizeMode="contain" /> : null}</View></Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginBottom: 10 },
  brand: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  hindi: { fontSize: 12, color: colors.textFaint, fontWeight: '600' },
  title: { fontSize: 36, lineHeight: 42, letterSpacing: -1.25, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 10, maxWidth: 340, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  messages: { paddingHorizontal: 20, paddingBottom: 18 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 26 },
  searchIcon: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 23, lineHeight: 28, color: colors.text, fontWeight: '700' },
  emptyCopy: { marginTop: 7, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  suggestions: { marginTop: 26, gap: 12 },
  suggestion: { minHeight: 58, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface },
  suggestionText: { fontSize: 15, color: colors.textSecondary },
  qmark: { fontSize: 18, color: colors.textMuted },
  userRow: { alignItems: 'flex-end', marginTop: 12, marginBottom: 10 },
  userBubble: { backgroundColor: colors.black, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 16, paddingVertical: 12, maxWidth: '86%' },
  userText: { color: colors.white, fontSize: 15, lineHeight: 21 },
  resultGroup: { marginBottom: 18 },
  answerBubble: { borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 17, padding: 16, backgroundColor: colors.surface },
  errorBubble: { borderColor: 'rgba(220,38,38,0.18)', backgroundColor: '#FFF8F8' },
  answerText: { fontSize: 15, lineHeight: 22, color: colors.text },
  fromLabel: { marginTop: 18, marginBottom: 10, fontSize: 11, color: colors.textFaint, fontWeight: '700', letterSpacing: 0.7 },
  sourceCard: { minHeight: 94, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, marginBottom: 10 },
  sourceImage: { width: 66, height: 66, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  sourceBody: { flex: 1 },
  sourceTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  sourceTitle: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: colors.text },
  sourceMeta: { marginTop: 3, fontSize: 12.5, color: colors.textMuted },
  openText: { marginTop: 8, fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
  delete: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFF8F8', alignItems: 'center', justifyContent: 'center' },
  searching: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 14 },
  searchingText: { fontSize: 13, color: colors.textMuted },
  composerWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 9 : 11, borderTopWidth: 1, borderTopColor: colors.borderSubtle, backgroundColor: colors.surface },
  composer: { minHeight: 58, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, maxHeight: 96, fontSize: 15, color: colors.text, paddingVertical: 11 },
  send: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: '#C7C7CB' },
  footer: { marginTop: 8, textAlign: 'center', fontSize: 11.5, color: colors.textFaint },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center' },
  previewClose: { position: 'absolute', top: 48, right: 18, width: 42, height: 42, borderRadius: 21, zIndex: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '82%' },
})

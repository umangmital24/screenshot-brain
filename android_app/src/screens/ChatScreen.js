import { useState, useRef } from 'react'
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
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { askChat, fetchMemories } from '../api'
import { attachLocalMedia, attachLocalMediaToSources } from '../localMemoryMedia'
import { ensureVisualIndexes } from '../visualIndex'
import { colors } from '../theme'

const SUGGESTIONS = [
  'What books did I save to read later?',
  'Find the restaurant I saved recently',
  'Which jobs did I screenshot for AI roles?',
  'Show me things I wanted to buy',
]

function cleanAssistantText(value) {
  if (!value) return ''

  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function SourceCard({ source, onOpenScreenshot }) {
  const canOpen = Boolean(source.local_image_uri)
  const Wrapper = canOpen ? TouchableOpacity : View

  return (
    <Wrapper
      style={styles.sourceCard}
      activeOpacity={0.84}
      onPress={canOpen ? () => onOpenScreenshot(source) : undefined}
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityLabel={canOpen ? `Open saved screenshot for ${source.item_name || 'this memory'}` : undefined}
    >
      {canOpen ? (
        <Image source={{ uri: source.local_image_uri }} style={styles.sourceThumb} resizeMode="cover" />
      ) : (
        <View style={styles.sourceIconWrap}>
          <Ionicons name="document-text-outline" size={15} color={colors.textSecondary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.sourceName} numberOfLines={1}>{source.item_name || 'Saved memory'}</Text>
        {source.extracted_text ? <Text style={styles.sourceDetail} numberOfLines={2}>{cleanAssistantText(source.extracted_text)}</Text> : null}
        {canOpen ? <Text style={styles.viewScreenshotText}>View original screenshot</Text> : null}
      </View>
      {canOpen ? <Ionicons name="chevron-forward" size={15} color={colors.textFaint} /> : null}
    </Wrapper>
  )
}

export default function ChatScreen() {
  const [question, setQuestion] = useState('')
  const [log, setLog] = useState([])
  const [asking, setAsking] = useState(false)
  const [previewSource, setPreviewSource] = useState(null)
  const listRef = useRef(null)

  async function prepareVisualSearch() {
    try {
      const memoryData = await fetchMemories()
      const withLocalMedia = await attachLocalMedia(memoryData.memories || [])
      await ensureVisualIndexes(withLocalMedia, 24)
    } catch (error) {
      // Search should still work from OCR/text if visual indexing is unavailable.
      console.warn('Visual search indexing skipped:', error?.message || error)
    }
  }

  function recentConversationHistory() {
    return log
      .filter((item) => (item.type === 'user' || item.type === 'assistant') && !item.error && item.text)
      .slice(-10)
      .map((item) => ({
        role: item.type === 'user' ? 'user' : 'assistant',
        text: item.text,
      }))
  }

  async function handleAsk(prefilled) {
    const q = (typeof prefilled === 'string' ? prefilled : question).trim()
    if (!q || asking) return
    const history = recentConversationHistory()
    setQuestion('')
    setAsking(true)
    setLog((prev) => [...prev, { type: 'user', text: q }])

    try {
      // Existing screenshots may pre-date visual indexing. Build a small private index
      // from their local image references before asking the backend. This runs on-device;
      // only derived labels/color ratios are synchronized, never raw screenshot pixels.
      await prepareVisualSearch()

      const data = await askChat(q, history)
      const sourcesWithLocalMedia = await attachLocalMediaToSources(data.sources || [])
      setLog((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: cleanAssistantText(data.answer),
          sources: sourcesWithLocalMedia,
        },
      ])
    } catch (err) {
      setLog((prev) => [...prev, { type: 'assistant', text: `I couldn't search your memories right now. ${err.message}`, sources: [], error: true }])
    } finally {
      setAsking(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <View style={styles.header}>
        <Text style={styles.brand}>Samhaal</Text>
        <Text style={styles.title}>Ask your memory</Text>
        <Text style={styles.subtitle}>Search naturally. Samhaal answers from the things you actually saved.</Text>
      </View>

      <FlatList
        ref={listRef}
        data={log}
        keyExtractor={(_, index) => String(index)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.messages, log.length === 0 && { flexGrow: 1 }]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.askIcon}>
              <Ionicons name="sparkles-outline" size={22} color={colors.text} />
            </View>
            <Text style={styles.emptyTitle}>Ask anything you remember vaguely</Text>
            <Text style={styles.emptyCopy}>You don't need the exact filename, date, or wording.</Text>
            <View style={styles.suggestionList}>
              {SUGGESTIONS.map((suggestion) => (
                <TouchableOpacity key={suggestion} style={styles.suggestion} onPress={() => handleAsk(suggestion)}>
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                  <Ionicons name="arrow-up-forward" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'user') {
            return (
              <View style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{item.text}</Text>
                </View>
              </View>
            )
          }

          return (
            <View style={styles.assistantGroup}>
              <View style={[styles.assistantBubble, item.error && styles.errorBubble]}>
                <Text style={styles.assistantText}>{item.text}</Text>
              </View>
              {item.sources?.length > 0 ? (
                <View style={styles.sourcesWrap}>
                  <Text style={styles.sourcesLabel}>From your memories</Text>
                  {item.sources.map((source, index) => (
                    <SourceCard
                      key={source.memory_id || `${source.item_name}-${index}`}
                      source={source}
                      onOpenScreenshot={setPreviewSource}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          )
        }}
        ListFooterComponent={asking ? <ActivityIndicator style={{ marginVertical: 18 }} color={colors.black} /> : null}
      />

      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Ask Samhaal..."
            placeholderTextColor={colors.textFaint}
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => handleAsk()}
            returnKeyType="send"
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!question.trim() || asking) && styles.sendButtonDisabled]}
            onPress={() => handleAsk()}
            disabled={!question.trim() || asking}
          >
            <Ionicons name="arrow-up" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
        <Text style={styles.footerNote}>Answers are grounded in your saved Samhaal memories.</Text>
      </View>

      <Modal
        visible={Boolean(previewSource)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewSource(null)}
      >
        <View style={styles.previewBackdrop}>
          <View style={styles.previewTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewEyebrow}>Saved screenshot</Text>
              <Text style={styles.previewTitle} numberOfLines={2}>{previewSource?.item_name || 'Samhaal memory'}</Text>
            </View>
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewSource(null)} accessibilityLabel="Close screenshot">
              <Ionicons name="close" size={23} color={colors.white} />
            </TouchableOpacity>
          </View>

          {previewSource?.local_image_uri ? (
            <Image source={{ uri: previewSource.local_image_uri }} style={styles.previewImage} resizeMode="contain" />
          ) : null}

          <View style={styles.previewPrivacyRow}>
            <Ionicons name="phone-portrait-outline" size={14} color="#C7C7CC" />
            <Text style={styles.previewPrivacyText}>Opened from the screenshot stored on this device.</Text>
          </View>
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
  emptyTitle: { fontSize: 17, color: colors.text, fontWeight: '700', letterSpacing: -0.2 },
  emptyCopy: { fontSize: 13, color: colors.textMuted, marginTop: 5, lineHeight: 18 },
  suggestionList: { marginTop: 20, gap: 8 },
  suggestion: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  suggestionText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  userRow: { alignItems: 'flex-end', marginTop: 12, marginBottom: 6 },
  userBubble: { backgroundColor: colors.black, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 10, maxWidth: '84%' },
  userText: { color: colors.white, fontSize: 14, lineHeight: 20 },
  assistantGroup: { marginTop: 6, marginBottom: 10 },
  assistantBubble: { borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, borderRadius: 13, padding: 13 },
  errorBubble: { borderColor: 'rgba(220,38,38,0.18)', backgroundColor: '#FFF8F8' },
  assistantText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  sourcesWrap: { marginTop: 10 },
  sourcesLabel: { fontSize: 10.5, color: colors.textFaint, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 10, padding: 9, marginBottom: 7, backgroundColor: colors.surfaceMuted },
  sourceThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.borderSubtle },
  sourceIconWrap: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sourceName: { fontSize: 12.5, color: colors.text, fontWeight: '700' },
  sourceDetail: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16, marginTop: 2 },
  viewScreenshotText: { fontSize: 10.5, color: colors.textSecondary, marginTop: 4, fontWeight: '600' },
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
  previewPrivacyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18, paddingTop: 12 },
  previewPrivacyText: { color: '#A7A7AC', fontSize: 11.5 },
})

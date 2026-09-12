import { useState } from 'react'
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
import { colors } from '../theme'
import useAskSamhaal from '../features/ask/useAskSamhaal'
import SourceCard from '../features/ask/SourceCard'

const SUGGESTIONS = [
  'What books did I save to read later?',
  'Find the restaurant I saved recently',
  'Which jobs did I screenshot for AI roles?',
  'Show me things I wanted to buy',
]

export default function ChatScreen() {
  const { question, setQuestion, log, asking, listRef, ask } = useAskSamhaal()
  const [previewSource, setPreviewSource] = useState(null)

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
                <TouchableOpacity key={suggestion} style={styles.suggestion} onPress={() => ask(suggestion)}>
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
            onSubmitEditing={() => ask()}
            returnKeyType="send"
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!question.trim() || asking) && styles.sendButtonDisabled]}
            onPress={() => ask()}
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
  suggestion: { minHeight: 48, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
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

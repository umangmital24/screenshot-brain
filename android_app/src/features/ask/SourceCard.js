import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../theme'
import { cleanAssistantText } from './useAskSamhaal'

export default function SourceCard({ source, onOpenScreenshot }) {
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
        {canOpen ? (
          <Text style={styles.viewScreenshotText}>View original screenshot</Text>
        ) : source.local_image_status === 'missing' ? (
          <Text style={styles.missingText}>Original screenshot is no longer on this device</Text>
        ) : null}
      </View>
      {canOpen ? <Ionicons name="chevron-forward" size={15} color={colors.textFaint} /> : null}
    </Wrapper>
  )
}

const styles = StyleSheet.create({
  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 10, padding: 9, marginBottom: 7, backgroundColor: colors.surfaceMuted },
  sourceThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.borderSubtle },
  sourceIconWrap: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sourceName: { fontSize: 12.5, color: colors.text, fontWeight: '700' },
  sourceDetail: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16, marginTop: 2 },
  viewScreenshotText: { fontSize: 10.5, color: colors.textSecondary, marginTop: 4, fontWeight: '600' },
  missingText: { fontSize: 10.5, color: colors.textFaint, marginTop: 4 },
})

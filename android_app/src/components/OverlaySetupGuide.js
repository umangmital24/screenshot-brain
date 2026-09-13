import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'

const STEPS = [
  ['1', 'Open Accessibility', 'Android will show its Accessibility settings. Find Samhaal in the installed services list.'],
  ['2', 'Turn on Samhaal', 'This lets Samhaal place the Save Bubble at the edge of your screen. It captures only when you tap it.'],
  ['3', 'Tap the bubble to save', 'Samhaal captures the current screen, runs OCR on-device and turns it into a searchable memory. The Bubble flow does not add another screenshot to your Gallery.'],
]

export default function OverlaySetupGuide({ visible, onOpenSettings, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles-outline" size={20} color={colors.text} />
          </View>
          <Text style={styles.heading}>Turn on the Save Bubble</Text>
          <Text style={styles.subheading}>
            Save anything from any app in one tap, without adding another screenshot to your Gallery.
          </Text>

          <View style={styles.disclosure}>
            <Text style={styles.disclosureTitle}>What Accessibility is used for</Text>
            <Text style={styles.disclosureBody}>
              Samhaal uses Accessibility to show the floating Save Bubble and capture the current screen only after you tap it. It does not continuously read your screen, passwords, keyboard input or taps in other apps. OCR runs on-device; only derived memory text is sent to Samhaal.
            </Text>
          </View>

          {STEPS.map(([number, title, body]) => (
            <View key={number} style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{number}</Text></View>
              <View style={styles.stepTextWrap}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepBody}>{body}</Text>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.primaryBtn} onPress={onOpenSettings} activeOpacity={0.84}>
            <Text style={styles.primaryBtnText}>Continue to Accessibility</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.secondaryBtnText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(9,9,11,0.28)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
  },
  grabber: { width: 36, height: 4, borderRadius: 999, backgroundColor: '#D9D9DC', alignSelf: 'center', marginBottom: 20 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heading: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.65 },
  subheading: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 17 },
  disclosure: { borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 20 },
  disclosureTitle: { color: colors.text, fontSize: 12.5, fontWeight: '700', marginBottom: 5 },
  disclosureBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  stepRow: { flexDirection: 'row', marginBottom: 17, gap: 12 },
  stepBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: colors.white, fontWeight: '700', fontSize: 11 },
  stepTextWrap: { flex: 1 },
  stepTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700', marginBottom: 2 },
  stepBody: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  primaryBtn: { minHeight: 52, backgroundColor: colors.black, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  secondaryBtn: { alignItems: 'center', paddingVertical: 13, marginTop: 3 },
  secondaryBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
})

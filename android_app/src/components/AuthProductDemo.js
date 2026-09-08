import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'

const STEPS = [
  { key: 'capture', label: 'Tap the Save Bubble' },
  { key: 'saved', label: 'Captured · OCR on device' },
  { key: 'memory', label: 'Becomes a memory' },
  { key: 'ask', label: 'Ask about it later' },
  { key: 'summary', label: 'Save · Organize · Ask' },
]

function SocialMock({ saved, bubbleScale }) {
  return (
    <View style={styles.phoneScreen}>
      <View style={styles.phoneTopRow}>
        <Text style={styles.phoneApp}>Instagram</Text>
        <Text style={styles.phoneDots}>•••</Text>
      </View>

      <View style={styles.profileRow}>
        <View style={styles.avatar} />
        <Text style={styles.profileName}>filmfinds</Text>
      </View>

      <View style={styles.reelCard}>
        <View style={styles.reelInner}>
          <Text style={styles.reelTitle}>IF YOU LIKED{`\n`}DRISHYAM</Text>
          <Text style={styles.reelRecommendation}>WATCH{`\n`}RAAT AKELI HAI</Text>
        </View>
      </View>

      <Text style={styles.caption}>filmfinds  A mystery worth saving.</Text>

      <Animated.View style={[styles.floatingBubble, { transform: [{ scale: bubbleScale }] }]}>
        <Text style={styles.floatingBubbleText}>{saved ? '✓' : '✦'}</Text>
      </Animated.View>
    </View>
  )
}

function MemoryMock() {
  return (
    <View style={styles.phoneScreen}>
      <Text style={styles.phoneApp}>Samhaal</Text>
      <Text style={styles.memoryHeading}>Remember it.</Text>
      <View style={styles.memoryCard}>
        <View style={styles.memoryImage}>
          <Text style={styles.memoryImageText}>Raat Akeli Hai</Text>
        </View>
        <Text style={styles.intent}>WATCH</Text>
        <Text style={styles.memoryTitle}>Raat Akeli Hai</Text>
        <Text style={styles.memorySummary}>Recommended if you liked Drishyam.</Text>
        <Text style={styles.memoryCategory}>Movies</Text>
      </View>
    </View>
  )
}

function AskMock() {
  return (
    <View style={styles.phoneScreen}>
      <Text style={styles.phoneApp}>Samhaal</Text>
      <Text style={styles.askHeading}>Ask your memory</Text>
      <View style={styles.questionBubble}>
        <Text style={styles.questionText}>What movie did I save from Instagram?</Text>
      </View>
      <View style={styles.answerCard}>
        <Text style={styles.answerTitle}>Raat Akeli Hai</Text>
        <Text style={styles.answerBody}>You saved it after seeing a recommendation for fans of Drishyam.</Text>
        <Text style={styles.sourceLabel}>FROM YOUR MEMORIES</Text>
      </View>
      <View style={styles.fakeComposer}>
        <Text style={styles.fakeComposerText}>Ask Samhaal…</Text>
        <Ionicons name="arrow-up" size={13} color={colors.white} style={styles.fakeSend} />
      </View>
    </View>
  )
}

function SummaryMock() {
  const items = [
    ['WATCH', 'Raat Akeli Hai', 'Movies'],
    ['APPLY', 'AI Engineer', 'Jobs'],
    ['BUY', 'Sony Headphones', 'Shopping'],
  ]

  return (
    <View style={styles.phoneScreen}>
      <Text style={styles.phoneApp}>Samhaal</Text>
      <Text style={styles.summaryHeading}>Save. Organize. Ask.</Text>
      {items.map(([intent, title, cat]) => (
        <View key={title} style={styles.miniCard}>
          <Text style={styles.miniIntent}>{intent}</Text>
          <Text style={styles.miniTitle}>{title}</Text>
          <Text style={styles.miniCategory}>{cat}</Text>
        </View>
      ))}
      <Text style={styles.summaryFooter}>✦  Your memory, searchable.</Text>
    </View>
  )
}

export default function AuthProductDemo() {
  const [stepIndex, setStepIndex] = useState(0)
  const opacity = useRef(new Animated.Value(1)).current
  const translateY = useRef(new Animated.Value(0)).current
  const bubbleScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 7, duration: 180, useNativeDriver: true }),
      ]).start(() => {
        setStepIndex((prev) => (prev + 1) % STEPS.length)
        translateY.setValue(-7)
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]).start()
      })
    }, 2200)

    return () => clearInterval(interval)
  }, [opacity, translateY])

  useEffect(() => {
    if (STEPS[stepIndex].key !== 'capture') return
    bubbleScale.setValue(1)
    Animated.sequence([
      Animated.delay(700),
      Animated.timing(bubbleScale, { toValue: 0.82, duration: 110, useNativeDriver: true }),
      Animated.spring(bubbleScale, { toValue: 1.08, useNativeDriver: true, friction: 4 }),
      Animated.spring(bubbleScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start()
  }, [bubbleScale, stepIndex])

  const content = useMemo(() => {
    const step = STEPS[stepIndex].key
    if (step === 'capture') return <SocialMock saved={false} bubbleScale={bubbleScale} />
    if (step === 'saved') return <SocialMock saved bubbleScale={bubbleScale} />
    if (step === 'memory') return <MemoryMock />
    if (step === 'ask') return <AskMock />
    return <SummaryMock />
  }, [bubbleScale, stepIndex])

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.phone, { opacity, transform: [{ translateY }] }]}> 
        <View style={styles.notch} />
        {content}
      </Animated.View>

      <View style={styles.stepPill}>
        <Text style={styles.stepText}>{stepIndex + 1}  {STEPS[stepIndex].label}</Text>
      </View>

      <View style={styles.dotsRow}>
        {STEPS.map((step, index) => (
          <View key={step.key} style={[styles.dot, index === stepIndex && styles.dotActive]} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 },
  phone: {
    width: 206,
    height: 356,
    borderRadius: 31,
    backgroundColor: '#09090B',
    padding: 7,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  notch: { position: 'absolute', zIndex: 4, top: 8, alignSelf: 'center', width: 60, height: 16, borderRadius: 8, backgroundColor: '#09090B' },
  phoneScreen: { flex: 1, borderRadius: 25, backgroundColor: '#FFFFFF', paddingHorizontal: 13, paddingTop: 27, overflow: 'hidden' },
  phoneTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  phoneApp: { fontSize: 10.5, fontWeight: '700', color: colors.text },
  phoneDots: { color: colors.textFaint, fontSize: 11 },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#D6D3D1' },
  profileName: { marginLeft: 8, fontSize: 9.5, fontWeight: '700', color: colors.text },
  reelCard: { marginTop: 10, height: 184, borderRadius: 12, backgroundColor: '#E7E5E4', padding: 13, justifyContent: 'center' },
  reelInner: { backgroundColor: '#1C1917', borderRadius: 11, paddingVertical: 20, paddingHorizontal: 10, alignItems: 'center' },
  reelTitle: { color: colors.white, textAlign: 'center', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  reelRecommendation: { color: '#FDE68A', textAlign: 'center', fontSize: 11.5, lineHeight: 15, fontWeight: '700', marginTop: 10 },
  caption: { marginTop: 8, fontSize: 8.5, color: colors.textMuted },
  floatingBubble: {
    position: 'absolute',
    width: 41,
    height: 41,
    right: 6,
    top: 151,
    borderRadius: 21,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  floatingBubbleText: { color: colors.white, fontSize: 18, fontWeight: '600' },
  memoryHeading: { fontSize: 21, fontWeight: '700', color: colors.text, marginTop: 18 },
  memoryCard: { marginTop: 18, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 15, padding: 11 },
  memoryImage: { height: 92, borderRadius: 10, backgroundColor: '#E7E5E4', alignItems: 'center', justifyContent: 'center' },
  memoryImageText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  intent: { marginTop: 11, color: colors.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  memoryTitle: { marginTop: 7, fontSize: 15.5, fontWeight: '700', color: colors.text },
  memorySummary: { marginTop: 6, color: colors.textMuted, fontSize: 9, lineHeight: 13 },
  memoryCategory: { marginTop: 9, color: colors.textFaint, fontSize: 8.5 },
  askHeading: { fontSize: 19.5, fontWeight: '700', color: colors.text, marginTop: 17 },
  questionBubble: { alignSelf: 'flex-end', marginTop: 24, maxWidth: 154, backgroundColor: colors.black, borderRadius: 14, borderBottomRightRadius: 5, padding: 10 },
  questionText: { color: colors.white, fontSize: 9.5, lineHeight: 13 },
  answerCard: { marginTop: 13, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 13, padding: 11 },
  answerTitle: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  answerBody: { marginTop: 5, fontSize: 9, lineHeight: 13, color: colors.textMuted },
  sourceLabel: { marginTop: 10, fontSize: 7.5, fontWeight: '800', color: colors.textFaint, letterSpacing: 0.5 },
  fakeComposer: { position: 'absolute', left: 13, right: 13, bottom: 14, height: 39, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center', paddingLeft: 10 },
  fakeComposerText: { fontSize: 9, color: colors.textFaint },
  fakeSend: { position: 'absolute', right: 5, top: 5, width: 29, height: 29, borderRadius: 9, backgroundColor: colors.black, textAlign: 'center', textAlignVertical: 'center', paddingTop: 7 },
  summaryHeading: { marginTop: 18, fontSize: 18.5, fontWeight: '700', color: colors.text },
  miniCard: { marginTop: 10, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 11, padding: 9 },
  miniIntent: { fontSize: 7.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  miniTitle: { marginTop: 4, fontSize: 11.5, fontWeight: '700', color: colors.text },
  miniCategory: { marginTop: 3, fontSize: 8, color: colors.textFaint },
  summaryFooter: { marginTop: 13, fontSize: 9.5, fontWeight: '600', color: colors.textMuted },
  stepPill: { marginTop: 9, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: 6 },
  stepText: { fontSize: 10.5, fontWeight: '600', color: colors.textSecondary },
  dotsRow: { flexDirection: 'row', gap: 5, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#D6D3D1' },
  dotActive: { width: 15, backgroundColor: colors.black },
})

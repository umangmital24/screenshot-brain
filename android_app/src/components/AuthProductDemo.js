import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'

const STEPS = [
  { key: 'capture', label: 'Tap the Save Bubble', duration: 2600 },
  { key: 'saved', label: 'Captured · OCR on device', duration: 1900 },
  { key: 'memory', label: 'Becomes a memory', duration: 2500 },
  { key: 'ask', label: 'Ask about it later', duration: 4200 },
  { key: 'summary', label: 'Save · Organize · Ask', duration: 2500 },
]

const QUESTION = 'What movie did I save from Instagram?'
const ANSWER = 'Raat Akeli Hai — saved from a recommendation for fans of Drishyam.'

function InstagramStyleMock({ saved, bubbleScale, bubbleX, tapPulse, flashOpacity }) {
  return (
    <View style={[styles.phoneScreen, styles.socialScreen]}>
      <View style={styles.socialHeader}>
        <Text style={styles.instagramWord}>Instagram</Text>
        <View style={styles.headerIcons}>
          <Ionicons name="heart-outline" size={14} color="#FFFFFF" />
          <Ionicons name="paper-plane-outline" size={14} color="#FFFFFF" />
        </View>
      </View>

      <View style={styles.reelsTitleRow}>
        <Text style={styles.reelsTitle}>Reels</Text>
        <Ionicons name="camera-outline" size={13} color="#FFFFFF" />
      </View>

      <View style={styles.reelBackdrop}>
        <View style={styles.posterGlowA} />
        <View style={styles.posterGlowB} />
        <View style={styles.posterCard}>
          <Text style={styles.posterEyebrow}>MOVIE RECOMMENDATION</Text>
          <Text style={styles.posterLead}>IF YOU LIKED</Text>
          <Text style={styles.posterTitle}>DRISHYAM</Text>
          <View style={styles.posterDivider} />
          <Text style={styles.posterLead}>WATCH</Text>
          <Text style={styles.posterRecommendation}>RAAT AKELI HAI</Text>
        </View>
      </View>

      <View style={styles.reelActions}>
        <View style={styles.actionItem}><Ionicons name="heart-outline" size={18} color="#FFFFFF" /><Text style={styles.actionCount}>14.2K</Text></View>
        <View style={styles.actionItem}><Ionicons name="chatbubble-outline" size={17} color="#FFFFFF" /><Text style={styles.actionCount}>238</Text></View>
        <View style={styles.actionItem}><Ionicons name="paper-plane-outline" size={17} color="#FFFFFF" /></View>
        <View style={styles.actionItem}><Ionicons name="bookmark-outline" size={17} color="#FFFFFF" /></View>
      </View>

      <View style={styles.reelMeta}>
        <View style={styles.creatorRow}>
          <View style={styles.creatorAvatar}><Text style={styles.creatorAvatarText}>F</Text></View>
          <Text style={styles.creatorName}>filmframe.daily</Text>
          <View style={styles.followButton}><Text style={styles.followText}>Follow</Text></View>
        </View>
        <Text style={styles.reelCaption}>A slow-burn mystery worth saving for movie night.</Text>
        <View style={styles.audioRow}><Ionicons name="musical-note" size={9} color="#FFFFFF" /><Text style={styles.audioText}>original audio · filmframe.daily</Text></View>
      </View>

      <Animated.View style={[styles.tapRing, { opacity: tapPulse, transform: [{ scale: tapPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] }) }] }]} />
      <Animated.View style={[styles.floatingBubble, { transform: [{ translateX: bubbleX }, { scale: bubbleScale }] }]}>
        <Text style={styles.floatingBubbleText}>{saved ? '✓' : '✦'}</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.captureFlash, { opacity: flashOpacity }]} />
    </View>
  )
}

function MemoryMock({ cardScale, cardY, imageOpacity }) {
  return (
    <View style={styles.phoneScreen}>
      <Text style={styles.phoneBrand}>Samhaal</Text>
      <Text style={styles.memoryHeading}>Remember it.</Text>
      <Text style={styles.memorySub}>That screenshot is now something you can find.</Text>
      <Animated.View style={[styles.memoryCard, { transform: [{ translateY: cardY }, { scale: cardScale }] }]}>
        <Animated.View style={[styles.memoryImage, { opacity: imageOpacity }]}>
          <View style={styles.memoryPosterMini}>
            <Text style={styles.memoryPosterLead}>IF YOU LIKED DRISHYAM</Text>
            <Text style={styles.memoryPosterTitle}>RAAT AKELI HAI</Text>
          </View>
        </Animated.View>
        <View style={styles.cardTopRow}><Text style={styles.intent}>WATCH</Text><Text style={styles.timeAgo}>just now</Text></View>
        <Text style={styles.memoryTitle}>Raat Akeli Hai</Text>
        <Text style={styles.memorySummary}>Recommended if you liked Drishyam.</Text>
        <Text style={styles.memoryCategory}>Movies</Text>
      </Animated.View>
    </View>
  )
}

function AskMock({ typedQuestion, answerWords, answerOpacity, sourceOpacity }) {
  return (
    <View style={styles.phoneScreen}>
      <Text style={styles.phoneBrand}>Samhaal</Text>
      <Text style={styles.askHeading}>Ask your memory</Text>
      <Text style={styles.askSub}>No exact filename or date needed.</Text>
      <View style={styles.questionBubble}>
        <Text style={styles.questionText}>{typedQuestion}<Text style={styles.cursor}>|</Text></Text>
      </View>
      <Animated.View style={[styles.answerCard, { opacity: answerOpacity }]}> 
        <Text style={styles.answerTitle}>Raat Akeli Hai</Text>
        <Text style={styles.answerBody}>{answerWords}</Text>
        <Animated.View style={{ opacity: sourceOpacity }}>
          <Text style={styles.sourceLabel}>FROM YOUR MEMORIES</Text>
          <View style={styles.sourceCard}>
            <View style={styles.sourceThumb}><Text style={styles.sourceThumbText}>R</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.sourceName}>Raat Akeli Hai</Text><Text style={styles.sourceDetail}>Movies · WATCH</Text></View>
          </View>
        </Animated.View>
      </Animated.View>
      <View style={styles.fakeComposer}>
        <Text style={styles.fakeComposerText}>Ask Samhaal…</Text>
        <View style={styles.fakeSend}><Ionicons name="arrow-up" size={13} color={colors.white} /></View>
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
      <Text style={styles.phoneBrand}>Samhaal</Text>
      <Text style={styles.summaryHeading}>Save. Organize. Ask.</Text>
      <Text style={styles.summarySub}>Your screenshots become a searchable second memory.</Text>
      {items.map(([intent, title, cat], index) => (
        <View key={title} style={[styles.miniCard, index === 0 && styles.miniCardFeatured]}>
          <View style={styles.miniTop}><Text style={styles.miniIntent}>{intent}</Text><Text style={styles.miniDot}>•</Text></View>
          <Text style={styles.miniTitle}>{title}</Text>
          <Text style={styles.miniCategory}>{cat}</Text>
        </View>
      ))}
      <View style={styles.summaryFooterRow}><Text style={styles.summaryStar}>✦</Text><Text style={styles.summaryFooter}>Your memory, searchable.</Text></View>
    </View>
  )
}

export default function AuthProductDemo() {
  const { height, width } = useWindowDimensions()
  const compact = height < 760
  const veryCompact = height < 690
  const phoneWidth = Math.min(width * (veryCompact ? 0.43 : 0.5), compact ? 184 : 210)
  const phoneHeight = phoneWidth * 1.77

  const [stepIndex, setStepIndex] = useState(0)
  const [typedQuestion, setTypedQuestion] = useState('')
  const [answerWords, setAnswerWords] = useState('')

  const sceneOpacity = useRef(new Animated.Value(1)).current
  const sceneX = useRef(new Animated.Value(0)).current
  const bubbleScale = useRef(new Animated.Value(1)).current
  const bubbleX = useRef(new Animated.Value(0)).current
  const tapPulse = useRef(new Animated.Value(0)).current
  const flashOpacity = useRef(new Animated.Value(0)).current
  const cardScale = useRef(new Animated.Value(0.88)).current
  const cardY = useRef(new Animated.Value(20)).current
  const imageOpacity = useRef(new Animated.Value(0)).current
  const answerOpacity = useRef(new Animated.Value(0)).current
  const sourceOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const current = STEPS[stepIndex]
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(sceneOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(sceneX, { toValue: -18, duration: 240, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setStepIndex((prev) => (prev + 1) % STEPS.length)
        sceneX.setValue(18)
        Animated.parallel([
          Animated.timing(sceneOpacity, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(sceneX, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start()
      })
    }, current.duration)
    return () => clearTimeout(timer)
  }, [sceneOpacity, sceneX, stepIndex])

  useEffect(() => {
    const key = STEPS[stepIndex].key
    if (key === 'capture') {
      bubbleScale.setValue(1)
      bubbleX.setValue(18)
      tapPulse.setValue(0)
      flashOpacity.setValue(0)
      Animated.sequence([
        Animated.timing(bubbleX, { toValue: 0, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(500),
        Animated.parallel([
          Animated.timing(bubbleScale, { toValue: 0.78, duration: 120, useNativeDriver: true }),
          Animated.timing(tapPulse, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(bubbleScale, { toValue: 1.08, friction: 4, useNativeDriver: true }),
          Animated.timing(tapPulse, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(flashOpacity, { toValue: 0.78, duration: 70, useNativeDriver: true }),
            Animated.timing(flashOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
          ]),
        ]),
        Animated.spring(bubbleScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start()
    }

    if (key === 'memory') {
      cardScale.setValue(0.86)
      cardY.setValue(24)
      imageOpacity.setValue(0)
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }),
        Animated.timing(cardY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(250),
          Animated.timing(imageOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
      ]).start()
    }

    if (key === 'ask') {
      setTypedQuestion('')
      setAnswerWords('')
      answerOpacity.setValue(0)
      sourceOpacity.setValue(0)
      let qIndex = 0
      let aIndex = 0
      const qTimer = setInterval(() => {
        qIndex += 1
        setTypedQuestion(QUESTION.slice(0, qIndex))
        if (qIndex >= QUESTION.length) {
          clearInterval(qTimer)
          Animated.timing(answerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start()
        }
      }, 34)
      const answerDelay = setTimeout(() => {
        const words = ANSWER.split(' ')
        const aTimer = setInterval(() => {
          aIndex += 1
          setAnswerWords(words.slice(0, aIndex).join(' '))
          if (aIndex >= words.length) {
            clearInterval(aTimer)
            Animated.timing(sourceOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start()
          }
        }, 72)
      }, 1500)
      return () => {
        clearInterval(qTimer)
        clearTimeout(answerDelay)
      }
    }
    return undefined
  }, [answerOpacity, bubbleScale, bubbleX, cardScale, cardY, flashOpacity, imageOpacity, sourceOpacity, stepIndex, tapPulse])

  const content = useMemo(() => {
    const step = STEPS[stepIndex].key
    if (step === 'capture') return <InstagramStyleMock saved={false} bubbleScale={bubbleScale} bubbleX={bubbleX} tapPulse={tapPulse} flashOpacity={flashOpacity} />
    if (step === 'saved') return <InstagramStyleMock saved bubbleScale={bubbleScale} bubbleX={bubbleX} tapPulse={tapPulse} flashOpacity={flashOpacity} />
    if (step === 'memory') return <MemoryMock cardScale={cardScale} cardY={cardY} imageOpacity={imageOpacity} />
    if (step === 'ask') return <AskMock typedQuestion={typedQuestion} answerWords={answerWords} answerOpacity={answerOpacity} sourceOpacity={sourceOpacity} />
    return <SummaryMock />
  }, [answerOpacity, answerWords, bubbleScale, bubbleX, cardScale, cardY, flashOpacity, imageOpacity, sourceOpacity, stepIndex, tapPulse, typedQuestion])

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Animated.View style={[styles.phone, { width: phoneWidth, height: phoneHeight, opacity: sceneOpacity, transform: [{ translateX: sceneX }] }]}> 
        <View style={styles.notch} />
        {content}
      </Animated.View>

      <View style={[styles.stepPill, compact && styles.stepPillCompact]}>
        <Text style={styles.stepText}>{stepIndex + 1}  {STEPS[stepIndex].label}</Text>
      </View>
      <View style={styles.dotsRow}>
        {STEPS.map((step, index) => <View key={step.key} style={[styles.dot, index === stepIndex && styles.dotActive]} />)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 9, paddingBottom: 8 },
  wrapCompact: { paddingTop: 4, paddingBottom: 4 },
  phone: { borderRadius: 32, backgroundColor: '#09090B', padding: 6, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  notch: { position: 'absolute', zIndex: 10, top: 8, alignSelf: 'center', width: 58, height: 15, borderRadius: 9, backgroundColor: '#09090B' },
  phoneScreen: { flex: 1, borderRadius: 27, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingTop: 27, overflow: 'hidden' },
  socialScreen: { backgroundColor: '#080808', paddingHorizontal: 0, paddingTop: 0 },
  socialHeader: { height: 31, paddingHorizontal: 11, paddingTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 3 },
  instagramWord: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', letterSpacing: -0.3 },
  headerIcons: { flexDirection: 'row', gap: 10 },
  reelsTitleRow: { position: 'absolute', zIndex: 4, top: 38, left: 11, right: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reelsTitle: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  reelBackdrop: { position: 'absolute', left: 0, right: 0, top: 31, bottom: 0, backgroundColor: '#171717', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  posterGlowA: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#2F3B55', opacity: 0.58, top: 38, left: -42 },
  posterGlowB: { position: 'absolute', width: 145, height: 145, borderRadius: 73, backgroundColor: '#633B3F', opacity: 0.5, bottom: 40, right: -56 },
  posterCard: { width: '74%', minHeight: 150, backgroundColor: 'rgba(5,5,5,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  posterEyebrow: { color: '#D4D4D8', fontSize: 5.8, fontWeight: '800', letterSpacing: 1.1, marginBottom: 12 },
  posterLead: { color: '#E4E4E7', fontSize: 7.5, fontWeight: '700', letterSpacing: 1 },
  posterTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 23, fontWeight: '900', letterSpacing: -0.8, marginTop: 2 },
  posterDivider: { width: 28, height: 1, backgroundColor: '#A1A1AA', marginVertical: 11 },
  posterRecommendation: { color: '#FDE68A', fontSize: 13.5, lineHeight: 17, textAlign: 'center', fontWeight: '900', letterSpacing: -0.3, marginTop: 2 },
  reelActions: { position: 'absolute', right: 8, bottom: 61, zIndex: 5, alignItems: 'center', gap: 10 },
  actionItem: { alignItems: 'center' },
  actionCount: { color: '#FFFFFF', fontSize: 6.5, fontWeight: '600', marginTop: 2 },
  reelMeta: { position: 'absolute', left: 10, right: 43, bottom: 13, zIndex: 5 },
  creatorRow: { flexDirection: 'row', alignItems: 'center' },
  creatorAvatar: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF' },
  creatorAvatarText: { color: '#18181B', fontSize: 7.5, fontWeight: '900' },
  creatorName: { color: '#FFFFFF', fontSize: 7.5, fontWeight: '700', marginLeft: 6 },
  followButton: { marginLeft: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  followText: { color: '#FFFFFF', fontSize: 5.8, fontWeight: '700' },
  reelCaption: { color: '#FFFFFF', fontSize: 6.8, lineHeight: 9.5, marginTop: 5 },
  audioRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  audioText: { color: '#F4F4F5', fontSize: 5.8 },
  floatingBubble: { position: 'absolute', zIndex: 8, width: 40, height: 40, right: 4, top: '43%', borderRadius: 20, backgroundColor: colors.black, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  floatingBubbleText: { color: colors.white, fontSize: 18, fontWeight: '700' },
  tapRing: { position: 'absolute', zIndex: 7, width: 44, height: 44, right: 2, top: '42.5%', borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  captureFlash: { ...StyleSheet.absoluteFillObject, zIndex: 9, backgroundColor: '#FFFFFF' },
  phoneBrand: { fontSize: 10.5, fontWeight: '700', color: colors.text },
  memoryHeading: { fontSize: 20.5, fontWeight: '700', color: colors.text, marginTop: 17 },
  memorySub: { fontSize: 8.2, lineHeight: 11, color: colors.textMuted, marginTop: 4, maxWidth: 160 },
  memoryCard: { marginTop: 15, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 15, padding: 10, backgroundColor: '#FFFFFF' },
  memoryImage: { height: 92, borderRadius: 10, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  memoryPosterMini: { width: '80%', paddingVertical: 13, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 8, backgroundColor: '#111111', alignItems: 'center' },
  memoryPosterLead: { color: '#D4D4D8', fontSize: 6, fontWeight: '700' },
  memoryPosterTitle: { color: '#FDE68A', fontSize: 12, fontWeight: '900', marginTop: 5 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  intent: { color: colors.textMuted, fontSize: 7.4, fontWeight: '800', letterSpacing: 0.65 },
  timeAgo: { color: colors.textFaint, fontSize: 6.8 },
  memoryTitle: { marginTop: 6, fontSize: 14.5, fontWeight: '700', color: colors.text },
  memorySummary: { marginTop: 5, color: colors.textMuted, fontSize: 8.6, lineHeight: 12 },
  memoryCategory: { marginTop: 8, color: colors.textFaint, fontSize: 7.8 },
  askHeading: { fontSize: 19, fontWeight: '700', color: colors.text, marginTop: 16 },
  askSub: { fontSize: 8, color: colors.textMuted, marginTop: 3 },
  questionBubble: { alignSelf: 'flex-end', marginTop: 19, maxWidth: 158, minHeight: 43, backgroundColor: colors.black, borderRadius: 14, borderBottomRightRadius: 5, padding: 9 },
  questionText: { color: colors.white, fontSize: 9.2, lineHeight: 12.5 },
  cursor: { color: '#D4D4D8' },
  answerCard: { marginTop: 11, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 13, padding: 10, backgroundColor: '#FFFFFF' },
  answerTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  answerBody: { marginTop: 5, minHeight: 27, fontSize: 8.7, lineHeight: 12.5, color: colors.textMuted },
  sourceLabel: { marginTop: 8, fontSize: 6.8, fontWeight: '800', color: colors.textFaint, letterSpacing: 0.55 },
  sourceCard: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 9, padding: 6, backgroundColor: colors.surfaceMuted },
  sourceThumb: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  sourceThumbText: { color: '#FDE68A', fontSize: 10, fontWeight: '800' },
  sourceName: { fontSize: 7.8, color: colors.text, fontWeight: '700' },
  sourceDetail: { fontSize: 6.8, color: colors.textFaint, marginTop: 2 },
  fakeComposer: { position: 'absolute', left: 12, right: 12, bottom: 13, height: 37, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center', paddingLeft: 10 },
  fakeComposerText: { fontSize: 8.5, color: colors.textFaint },
  fakeSend: { position: 'absolute', right: 4, top: 4, width: 29, height: 29, borderRadius: 9, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  summaryHeading: { marginTop: 17, fontSize: 18, fontWeight: '700', color: colors.text },
  summarySub: { marginTop: 4, fontSize: 8.3, lineHeight: 11.5, color: colors.textMuted },
  miniCard: { marginTop: 9, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 11, padding: 8.5 },
  miniCardFeatured: { backgroundColor: '#FAFAFA' },
  miniTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniIntent: { fontSize: 7, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  miniDot: { fontSize: 8, color: colors.textFaint },
  miniTitle: { marginTop: 3.5, fontSize: 11, fontWeight: '700', color: colors.text },
  miniCategory: { marginTop: 3, fontSize: 7.5, color: colors.textFaint },
  summaryFooterRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryStar: { fontSize: 11, color: colors.text },
  summaryFooter: { fontSize: 8.8, fontWeight: '600', color: colors.textMuted },
  stepPill: { marginTop: 8, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 13, paddingVertical: 6 },
  stepPillCompact: { marginTop: 6, paddingVertical: 5 },
  stepText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
  dotsRow: { flexDirection: 'row', gap: 5, marginTop: 7 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#D6D3D1' },
  dotActive: { width: 15, backgroundColor: colors.black },
})

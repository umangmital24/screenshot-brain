import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'

const STEPS = [
  { key: 'capture', label: 'Save from any app', duration: 2600 },
  { key: 'saved', label: 'Captured on-device', duration: 1700 },
  { key: 'memory', label: 'Organized into memory', duration: 2500 },
  { key: 'ask', label: 'Ask naturally', duration: 4300 },
  { key: 'summary', label: 'Find it later', duration: 2500 },
]

const QUESTION = 'What movie did I save from Instagram?'
const ANSWER = 'Raat Akeli Hai — saved from a recommendation for fans of Drishyam.'

function ReelMock({ saved, bubbleScale, bubbleX, tapPulse, flashOpacity }) {
  return (
    <View style={[styles.phoneScreen, styles.reelScreen]}>
      <View style={styles.reelTopBar}>
        <Text style={styles.reelsLabel}>Reels</Text>
        <View style={styles.reelTopIcons}>
          <Ionicons name="heart-outline" size={15} color="#fff" />
          <Ionicons name="camera-outline" size={15} color="#fff" />
        </View>
      </View>

      <View style={styles.reelVisual}>
        <View style={styles.reelGlowOne} />
        <View style={styles.reelGlowTwo} />
        <View style={styles.posterPanel}>
          <Text style={styles.posterKicker}>MOVIE RECOMMENDATION</Text>
          <Text style={styles.posterSmall}>IF YOU LIKED</Text>
          <Text style={styles.posterHero}>DRISHYAM</Text>
          <View style={styles.posterRule} />
          <Text style={styles.posterSmall}>WATCH</Text>
          <Text style={styles.posterPick}>RAAT AKELI HAI</Text>
        </View>
      </View>

      <View style={styles.reelActions}>
        <View style={styles.action}><Ionicons name="heart-outline" size={19} color="#fff" /><Text style={styles.actionText}>14.2K</Text></View>
        <View style={styles.action}><Ionicons name="chatbubble-outline" size={18} color="#fff" /><Text style={styles.actionText}>238</Text></View>
        <Ionicons name="paper-plane-outline" size={18} color="#fff" />
        <Ionicons name="bookmark-outline" size={18} color="#fff" />
      </View>

      <View style={styles.reelMeta}>
        <View style={styles.creatorRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>F</Text></View>
          <Text style={styles.creator}>filmframe.daily</Text>
          <View style={styles.follow}><Text style={styles.followText}>Follow</Text></View>
        </View>
        <Text style={styles.caption}>A slow-burn mystery worth saving for movie night.</Text>
        <View style={styles.audioRow}>
          <Ionicons name="musical-note" size={9} color="#fff" />
          <Text style={styles.audioText}>original audio · filmframe.daily</Text>
        </View>
      </View>

      <Animated.View
        style={[
          styles.tapRing,
          {
            opacity: tapPulse,
            transform: [{ scale: tapPulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.5] }) }],
          },
        ]}
      />
      <Animated.View style={[styles.saveBubble, { transform: [{ translateX: bubbleX }, { scale: bubbleScale }] }]}>
        <Text style={styles.saveBubbleText}>{saved ? '✓' : '✦'}</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.captureFlash, { opacity: flashOpacity }]} />
    </View>
  )
}

function MemoryMock({ cardScale, cardY, imageOpacity }) {
  return (
    <View style={styles.phoneScreen}>
      <View style={styles.screenHeader}>
        <Text style={styles.phoneBrand}>Samhaal</Text>
        <Text style={styles.screenTitle}>Remember it.</Text>
        <Text style={styles.screenSub}>Your screenshot is now searchable.</Text>
      </View>

      <Animated.View style={[styles.memoryCard, { transform: [{ translateY: cardY }, { scale: cardScale }] }]}> 
        <Animated.View style={[styles.memoryImage, { opacity: imageOpacity }]}> 
          <Text style={styles.memoryImageSmall}>IF YOU LIKED DRISHYAM</Text>
          <Text style={styles.memoryImageTitle}>RAAT AKELI HAI</Text>
        </Animated.View>
        <View style={styles.memoryMetaRow}>
          <Text style={styles.intent}>WATCH</Text>
          <Text style={styles.timeAgo}>just now</Text>
        </View>
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
      <View style={styles.screenHeader}>
        <Text style={styles.phoneBrand}>Samhaal</Text>
        <Text style={styles.screenTitle}>Ask your memory</Text>
        <Text style={styles.screenSub}>No filename or date needed.</Text>
      </View>

      <View style={styles.askArea}>
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
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceName}>Raat Akeli Hai</Text>
                <Text style={styles.sourceDetail}>Movies · WATCH</Text>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.composer}>
        <Text style={styles.composerText}>Ask Samhaal…</Text>
        <View style={styles.sendButton}><Ionicons name="arrow-up" size={13} color="#fff" /></View>
      </View>
    </View>
  )
}

function SummaryMock() {
  return (
    <View style={styles.phoneScreen}>
      <View style={styles.screenHeader}>
        <Text style={styles.phoneBrand}>Samhaal</Text>
        <Text style={styles.screenTitle}>Save. Organize. Ask.</Text>
        <Text style={styles.screenSub}>A searchable second memory.</Text>
      </View>

      <View style={styles.summaryList}>
        {[
          ['WATCH', 'Raat Akeli Hai', 'Movies'],
          ['APPLY', 'AI Engineer', 'Jobs'],
          ['BUY', 'Sony Headphones', 'Shopping'],
        ].map(([intent, title, category]) => (
          <View key={title} style={styles.summaryCard}>
            <Text style={styles.summaryIntent}>{intent}</Text>
            <Text style={styles.summaryTitle}>{title}</Text>
            <Text style={styles.summaryCategory}>{category}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default function AuthProductDemo() {
  const { height, width } = useWindowDimensions()
  const compact = height < 760
  const veryCompact = height < 690
  const phoneWidth = Math.min(width * (veryCompact ? 0.50 : compact ? 0.54 : 0.58), veryCompact ? 196 : compact ? 212 : 228)
  const phoneHeight = phoneWidth * 1.78

  const [stepIndex, setStepIndex] = useState(0)
  const [typedQuestion, setTypedQuestion] = useState('')
  const [answerWords, setAnswerWords] = useState('')

  const sceneOpacity = useRef(new Animated.Value(1)).current
  const sceneX = useRef(new Animated.Value(0)).current
  const bubbleScale = useRef(new Animated.Value(1)).current
  const bubbleX = useRef(new Animated.Value(0)).current
  const tapPulse = useRef(new Animated.Value(0)).current
  const flashOpacity = useRef(new Animated.Value(0)).current
  const cardScale = useRef(new Animated.Value(0.9)).current
  const cardY = useRef(new Animated.Value(20)).current
  const imageOpacity = useRef(new Animated.Value(0)).current
  const answerOpacity = useRef(new Animated.Value(0)).current
  const sourceOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const current = STEPS[stepIndex]
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(sceneOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(sceneX, { toValue: -14, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setStepIndex((prev) => (prev + 1) % STEPS.length)
        sceneX.setValue(14)
        Animated.parallel([
          Animated.timing(sceneOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(sceneX, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
        Animated.timing(bubbleX, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(450),
        Animated.parallel([
          Animated.timing(bubbleScale, { toValue: 0.78, duration: 110, useNativeDriver: true }),
          Animated.timing(tapPulse, { toValue: 1, duration: 160, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(bubbleScale, { toValue: 1.08, friction: 4, useNativeDriver: true }),
          Animated.timing(tapPulse, { toValue: 0, duration: 240, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(flashOpacity, { toValue: 0.72, duration: 65, useNativeDriver: true }),
            Animated.timing(flashOpacity, { toValue: 0, duration: 210, useNativeDriver: true }),
          ]),
        ]),
        Animated.spring(bubbleScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start()
    }

    if (key === 'memory') {
      cardScale.setValue(0.9)
      cardY.setValue(18)
      imageOpacity.setValue(0)
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }),
        Animated.timing(cardY, { toValue: 0, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(180),
          Animated.timing(imageOpacity, { toValue: 1, duration: 330, useNativeDriver: true }),
        ]),
      ]).start()
    }

    if (key === 'ask') {
      setTypedQuestion('')
      setAnswerWords('')
      answerOpacity.setValue(0)
      sourceOpacity.setValue(0)
      let qIndex = 0
      let aTimer

      const qTimer = setInterval(() => {
        qIndex += 1
        setTypedQuestion(QUESTION.slice(0, qIndex))
        if (qIndex >= QUESTION.length) {
          clearInterval(qTimer)
          Animated.timing(answerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()
        }
      }, 32)

      const answerDelay = setTimeout(() => {
        const words = ANSWER.split(' ')
        let aIndex = 0
        aTimer = setInterval(() => {
          aIndex += 1
          setAnswerWords(words.slice(0, aIndex).join(' '))
          if (aIndex >= words.length) {
            clearInterval(aTimer)
            Animated.timing(sourceOpacity, { toValue: 1, duration: 280, useNativeDriver: true }).start()
          }
        }, 68)
      }, 1450)

      return () => {
        clearInterval(qTimer)
        if (aTimer) clearInterval(aTimer)
        clearTimeout(answerDelay)
      }
    }

    return undefined
  }, [answerOpacity, bubbleScale, bubbleX, cardScale, cardY, flashOpacity, imageOpacity, sourceOpacity, stepIndex, tapPulse])

  const scene = useMemo(() => {
    const key = STEPS[stepIndex].key
    if (key === 'capture') return <ReelMock saved={false} bubbleScale={bubbleScale} bubbleX={bubbleX} tapPulse={tapPulse} flashOpacity={flashOpacity} />
    if (key === 'saved') return <ReelMock saved bubbleScale={bubbleScale} bubbleX={bubbleX} tapPulse={tapPulse} flashOpacity={flashOpacity} />
    if (key === 'memory') return <MemoryMock cardScale={cardScale} cardY={cardY} imageOpacity={imageOpacity} />
    if (key === 'ask') return <AskMock typedQuestion={typedQuestion} answerWords={answerWords} answerOpacity={answerOpacity} sourceOpacity={sourceOpacity} />
    return <SummaryMock />
  }, [answerOpacity, answerWords, bubbleScale, bubbleX, cardScale, cardY, flashOpacity, imageOpacity, sourceOpacity, stepIndex, tapPulse, typedQuestion])

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.phone, { width: phoneWidth, height: phoneHeight, opacity: sceneOpacity, transform: [{ translateX: sceneX }] }]}> 
        <View style={styles.notch} />
        {scene}
      </Animated.View>

      <View style={styles.progressBlock}>
        <Text style={styles.stepText}>{STEPS[stepIndex].label}</Text>
        <View style={styles.dotsTrack}>
          {STEPS.map((step, index) => (
            <View key={step.key} style={styles.dotSlot}>
              <View style={[styles.dot, index === stepIndex && styles.dotActive]} />
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  phone: {
    borderRadius: 34,
    backgroundColor: '#09090B',
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9,
  },
  notch: { position: 'absolute', zIndex: 12, top: 8, left: '50%', marginLeft: -30, width: 60, height: 16, borderRadius: 9, backgroundColor: '#09090B' },
  phoneScreen: { flex: 1, borderRadius: 29, backgroundColor: '#fff', paddingHorizontal: 14, paddingTop: 28, overflow: 'hidden' },

  reelScreen: { backgroundColor: '#080808', paddingHorizontal: 0, paddingTop: 0 },
  reelTopBar: { height: 38, paddingHorizontal: 12, paddingTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 4 },
  reelsLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
  reelTopIcons: { flexDirection: 'row', gap: 12 },
  reelVisual: { position: 'absolute', left: 0, right: 0, top: 38, bottom: 0, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  reelGlowOne: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#334155', opacity: 0.55, top: 36, left: -55 },
  reelGlowTwo: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#713F46', opacity: 0.48, bottom: 38, right: -60 },
  posterPanel: { width: '72%', minHeight: 168, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(7,7,7,0.80)', alignItems: 'center', justifyContent: 'center', padding: 14 },
  posterKicker: { color: '#D4D4D8', fontSize: 6, fontWeight: '800', letterSpacing: 1.1, marginBottom: 13 },
  posterSmall: { color: '#E4E4E7', fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  posterHero: { color: '#fff', fontSize: 22, lineHeight: 25, fontWeight: '900', marginTop: 2 },
  posterRule: { width: 30, height: 1, backgroundColor: '#A1A1AA', marginVertical: 12 },
  posterPick: { color: '#FDE68A', fontSize: 14, lineHeight: 17, fontWeight: '900', textAlign: 'center', marginTop: 3 },
  reelActions: { position: 'absolute', right: 9, bottom: 70, zIndex: 6, alignItems: 'center', gap: 13 },
  action: { alignItems: 'center' },
  actionText: { color: '#fff', fontSize: 6.5, fontWeight: '600', marginTop: 2 },
  reelMeta: { position: 'absolute', left: 11, right: 48, bottom: 16, zIndex: 6 },
  creatorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#111', fontSize: 8, fontWeight: '900' },
  creator: { color: '#fff', fontSize: 8, fontWeight: '800', marginLeft: 6 },
  follow: { marginLeft: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  followText: { color: '#fff', fontSize: 6, fontWeight: '700' },
  caption: { color: '#fff', fontSize: 7, lineHeight: 10, marginTop: 6 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  audioText: { color: '#F4F4F5', fontSize: 6 },
  saveBubble: { position: 'absolute', zIndex: 9, width: 42, height: 42, right: 4, top: '43%', borderRadius: 21, backgroundColor: '#09090B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', elevation: 8 },
  saveBubbleText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  tapRing: { position: 'absolute', zIndex: 8, width: 46, height: 46, right: 2, top: '42.5%', borderRadius: 23, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
  captureFlash: { ...StyleSheet.absoluteFillObject, zIndex: 10, backgroundColor: '#fff' },

  screenHeader: { width: '100%', alignItems: 'flex-start' },
  phoneBrand: { fontSize: 10.5, fontWeight: '800', color: colors.text },
  screenTitle: { fontSize: 20, lineHeight: 24, fontWeight: '800', color: colors.text, marginTop: 17, letterSpacing: -0.45 },
  screenSub: { fontSize: 8.3, lineHeight: 11.5, color: colors.textMuted, marginTop: 4 },

  memoryCard: { width: '100%', marginTop: 17, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 15, padding: 10, backgroundColor: '#fff' },
  memoryImage: { height: 102, borderRadius: 10, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  memoryImageSmall: { color: '#D4D4D8', fontSize: 6.2, fontWeight: '700' },
  memoryImageTitle: { color: '#FDE68A', fontSize: 13, fontWeight: '900', marginTop: 6 },
  memoryMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  intent: { fontSize: 7.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6 },
  timeAgo: { fontSize: 6.8, color: colors.textFaint },
  memoryTitle: { fontSize: 15, lineHeight: 18, fontWeight: '800', color: colors.text, marginTop: 6 },
  memorySummary: { fontSize: 8.6, lineHeight: 12, color: colors.textMuted, marginTop: 5 },
  memoryCategory: { fontSize: 7.8, color: colors.textFaint, marginTop: 9 },

  askArea: { width: '100%', marginTop: 20 },
  questionBubble: { alignSelf: 'flex-end', width: '82%', minHeight: 48, borderRadius: 14, borderBottomRightRadius: 5, backgroundColor: '#09090B', paddingHorizontal: 10, paddingVertical: 9 },
  questionText: { color: '#fff', fontSize: 9.2, lineHeight: 13 },
  cursor: { color: '#D4D4D8' },
  answerCard: { width: '100%', marginTop: 12, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 13, padding: 10, backgroundColor: '#fff' },
  answerTitle: { fontSize: 12.2, fontWeight: '800', color: colors.text },
  answerBody: { fontSize: 8.7, lineHeight: 12.5, color: colors.textMuted, marginTop: 5, minHeight: 28 },
  sourceLabel: { fontSize: 6.7, fontWeight: '800', color: colors.textFaint, letterSpacing: 0.55, marginTop: 9 },
  sourceCard: { marginTop: 5, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 9, backgroundColor: '#FAFAFA', padding: 6, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sourceThumb: { width: 25, height: 25, borderRadius: 6, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  sourceThumbText: { color: '#FDE68A', fontSize: 10, fontWeight: '900' },
  sourceName: { fontSize: 7.8, fontWeight: '700', color: colors.text },
  sourceDetail: { fontSize: 6.8, color: colors.textFaint, marginTop: 2 },
  composer: { position: 'absolute', left: 14, right: 14, bottom: 14, height: 39, borderWidth: 1, borderColor: colors.border, borderRadius: 12, justifyContent: 'center', paddingLeft: 10 },
  composerText: { fontSize: 8.5, color: colors.textFaint },
  sendButton: { position: 'absolute', right: 5, top: 5, width: 29, height: 29, borderRadius: 9, backgroundColor: '#09090B', alignItems: 'center', justifyContent: 'center' },

  summaryList: { width: '100%', marginTop: 18, gap: 9 },
  summaryCard: { width: '100%', borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 11, padding: 9, backgroundColor: '#fff' },
  summaryIntent: { fontSize: 7, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  summaryTitle: { fontSize: 11.5, fontWeight: '800', color: colors.text, marginTop: 4 },
  summaryCategory: { fontSize: 7.5, color: colors.textFaint, marginTop: 3 },

  progressBlock: { width: 190, alignItems: 'center', marginTop: 12 },
  stepText: { fontSize: 10.5, fontWeight: '650', color: colors.textSecondary, textAlign: 'center', minHeight: 15 },
  dotsTrack: { marginTop: 8, width: 104, height: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dotSlot: { width: 20, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#D6D3D1' },
  dotActive: { width: 16, backgroundColor: '#09090B' },
})

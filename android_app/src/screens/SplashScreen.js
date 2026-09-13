import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'

function SamhaalMark() {
  return (
    <View style={styles.mark}>
      <Ionicons name="leaf-outline" size={38} color="#FFFFFF" style={{ transform: [{ rotate: '-28deg' }] }} />
    </View>
  )
}

export default function SplashScreen({ onDone }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start()
    const timer = setTimeout(() => onDone?.(), 1500)
    return () => clearTimeout(timer)
  }, [onDone, opacity, translateY])

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.center, { opacity, transform: [{ translateY }] }]}> 
        <SamhaalMark />
        <View style={styles.brandRow}><Text style={styles.brand}>Samhaal</Text><Text style={styles.hindi}>संभाल</Text></View>
        <Text style={styles.tagline}>Remember what you save.</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', marginTop: -24 },
  mark: { width: 72, height: 72, borderRadius: 16, marginBottom: 20, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  brand: { fontSize: 34, fontWeight: '700', letterSpacing: -1.1, color: colors.text },
  hindi: { fontSize: 18, fontWeight: '600', color: colors.textMuted },
  tagline: { marginTop: 9, fontSize: 14, fontWeight: '500', color: colors.textMuted },
})

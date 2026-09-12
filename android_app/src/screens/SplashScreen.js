import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

export default function SplashScreen({ onDone }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start()

    const timer = setTimeout(() => onDone?.(), 1650)
    return () => clearTimeout(timer)
  }, [onDone, opacity, translateY])

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.center, { opacity, transform: [{ translateY }] }]}> 
        <View style={styles.mark}><Text style={styles.spark}>✦</Text></View>
        <Text style={styles.brand}>Samhaal</Text>
        <Text style={styles.tagline}>Remember what you save.</Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAF9', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', marginTop: -24 },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  spark: { fontSize: 22, color: colors.text },
  brand: { fontSize: 35, fontWeight: '700', letterSpacing: -1.1, color: colors.text },
  tagline: { marginTop: 10, fontSize: 15, fontWeight: '500', color: colors.textMuted },
})

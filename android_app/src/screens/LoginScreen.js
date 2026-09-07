import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../supabaseClient'
import { colors } from '../theme'

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
})

export default function LoginScreen() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogleSignIn() {
    setMessage(null)
    setGoogleLoading(true)
    try {
      await GoogleSignin.hasPlayServices()
      const response = await GoogleSignin.signIn()
      const idToken = response.data?.idToken ?? response.idToken
      if (!idToken) throw new Error('No ID token returned from Google')

      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
      if (error) throw error
    } catch (err) {
      setMessage({ text: err.message || 'Google sign-in failed', error: true })
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleSubmit() {
    setMessage(null)
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: 'screenshotmemory://' },
        })
        if (error) throw error
        setMessage({ text: 'Account created. Check your email to confirm it.', error: false })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setMessage({ text: err.message || 'Something went wrong', error: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <Ionicons name="sparkles-outline" size={20} color={colors.black} />
        </View>
        <Text style={styles.brand}>Samhaal</Text>
        <Text style={styles.title}>{mode === 'signup' ? 'Create your memory space' : 'Welcome back'}</Text>
        <Text style={styles.copy}>
          Save screenshots with intent, then find them again by searching or simply asking.
        </Text>

        <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={googleLoading}>
          {googleLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textFaint}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textFaint}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>
          )}
        </TouchableOpacity>

        {message && <Text style={[styles.message, message.error && styles.messageError]}>{message.text}</Text>}

        <TouchableOpacity
          onPress={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
            setMessage(null)
          }}
        >
          <Text style={styles.toggleText}>
            {mode === 'signin' ? 'New to Samhaal? Create an account' : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.privacy}>Raw screenshots are processed on your device before Samhaal organizes them.</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', paddingHorizontal: 24 },
  content: { width: '100%', maxWidth: 390, alignSelf: 'center' },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  brand: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, color: colors.textSecondary, marginBottom: 14 },
  title: { fontSize: 31, lineHeight: 37, letterSpacing: -0.8, fontWeight: '700', color: colors.text, marginBottom: 10 },
  copy: { fontSize: 14, color: colors.textMuted, lineHeight: 21, marginBottom: 28, maxWidth: 350 },
  googleButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  googleButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  dividerText: { fontSize: 12, color: colors.textFaint },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  primaryButton: { backgroundColor: colors.black, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  message: { fontSize: 13, color: colors.success, marginTop: 14, lineHeight: 18 },
  messageError: { color: colors.danger },
  toggleText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 20 },
  privacy: { fontSize: 11.5, color: colors.textFaint, textAlign: 'center', lineHeight: 17, marginTop: 34 },
})

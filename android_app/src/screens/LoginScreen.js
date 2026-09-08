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
  ScrollView,
} from 'react-native'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../supabaseClient'
import { colors } from '../theme'
import AuthProductDemo from '../components/AuthProductDemo'

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

  const isSignup = mode === 'signup'

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.demoSection}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>Samhaal</Text>
            <Text style={styles.brandTag}>Remember what you save.</Text>
          </View>
          <AuthProductDemo />
        </View>

        <View style={styles.authSection}>
          <Text style={styles.title}>{isSignup ? 'Create your memory space.' : 'From screenshot to memory.'}</Text>
          <Text style={styles.copy}>
            Save anything. Samhaal organizes it into a memory you can search and ask about later.
          </Text>

          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={googleLoading} activeOpacity={0.8}>
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

          <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>{isSignup ? 'Create account' : 'Sign in'}</Text>
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
              {isSignup ? 'Already have an account? Sign in' : 'New to Samhaal? Create an account'}
            </Text>
          </TouchableOpacity>

          <View style={styles.privacyRow}>
            <Text style={styles.privacyTitle}>Privacy-first by design</Text>
            <Text style={styles.privacy}>
              Screens are read on-device first. Raw screenshots are not sent to AI by default.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAF9' },
  scrollContent: { flexGrow: 1 },
  demoSection: {
    backgroundColor: '#F5F5F4',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingTop: Platform.OS === 'ios' ? 54 : 34,
    paddingBottom: 10,
    minHeight: 465,
  },
  brandRow: { paddingHorizontal: 22, marginBottom: 2 },
  brand: { fontSize: 13, fontWeight: '700', color: colors.text },
  brandTag: { fontSize: 10.5, color: colors.textFaint, marginTop: 3 },
  authSection: { paddingHorizontal: 24, paddingTop: 27, paddingBottom: 34, backgroundColor: colors.canvas },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.7, fontWeight: '700', color: colors.text },
  copy: { fontSize: 13.5, color: colors.textMuted, lineHeight: 20, marginTop: 8, marginBottom: 22, maxWidth: 348 },
  googleButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  googleButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 15, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  dividerText: { fontSize: 11, color: colors.textFaint },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: 9,
  },
  primaryButton: { minHeight: 49, backgroundColor: colors.black, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  message: { fontSize: 12.5, color: colors.success, marginTop: 12, lineHeight: 18 },
  messageError: { color: colors.danger },
  toggleText: { fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', marginTop: 17, fontWeight: '500' },
  privacyRow: { alignItems: 'center', marginTop: 23 },
  privacyTitle: { fontSize: 10.5, color: colors.textSecondary, fontWeight: '700' },
  privacy: { marginTop: 4, fontSize: 10.5, color: colors.textFaint, textAlign: 'center', lineHeight: 15, maxWidth: 310 },
})

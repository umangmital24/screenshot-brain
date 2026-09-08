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
  useWindowDimensions,
} from 'react-native'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { FontAwesome, Ionicons } from '@expo/vector-icons'
import { supabase } from '../supabaseClient'
import { colors } from '../theme'
import AuthProductDemo from '../components/AuthProductDemo'

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
})

export default function LoginScreen() {
  const { height } = useWindowDimensions()
  const compact = height < 760
  const veryCompact = height < 690

  const [mode, setMode] = useState('signin')
  const [emailModeOpen, setEmailModeOpen] = useState(false)
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
        <View style={[
          styles.demoSection,
          compact && styles.demoSectionCompact,
          veryCompact && styles.demoSectionVeryCompact,
        ]}>
          <View style={[styles.brandRow, compact && styles.brandRowCompact]}>
            <Text style={styles.brand}>Samhaal</Text>
            {!veryCompact ? <Text style={styles.brandTag}>Remember what you save.</Text> : null}
          </View>
          <AuthProductDemo />
        </View>

        <View style={[styles.authSection, compact && styles.authSectionCompact]}>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            {isSignup ? 'Create your memory space.' : 'From screenshot to memory.'}
          </Text>
          <Text style={[styles.copy, compact && styles.copyCompact]}>
            Save anything. Samhaal organizes it into a memory you can search and ask about later.
          </Text>

          <TouchableOpacity style={styles.providerButton} onPress={handleGoogleSignIn} disabled={googleLoading} activeOpacity={0.8}>
            {googleLoading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <View style={styles.providerButtonContent}>
                <FontAwesome name="google" size={18} color="#4285F4" />
                <Text style={styles.providerButtonText}>Continue with Google</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.providerButton, styles.emailProviderButton]}
            onPress={() => {
              setEmailModeOpen((open) => !open)
              setMessage(null)
            }}
            activeOpacity={0.8}
          >
            <View style={styles.providerButtonContent}>
              <Ionicons name="mail-outline" size={19} color={colors.text} />
              <Text style={styles.providerButtonText}>Continue with Email</Text>
            </View>
          </TouchableOpacity>

          {emailModeOpen ? (
            <View style={styles.emailForm}>
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
                {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{isSignup ? 'Create account' : 'Sign in'}</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {message && <Text style={[styles.message, message.error && styles.messageError]}>{message.text}</Text>}

          <TouchableOpacity
            onPress={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
              setEmailModeOpen(true)
              setMessage(null)
            }}
          >
            <Text style={[styles.toggleText, compact && styles.toggleTextCompact]}>
              {isSignup ? 'Already have an account? Sign in' : 'New to Samhaal? Create an account'}
            </Text>
          </TouchableOpacity>

          {!veryCompact ? (
            <View style={[styles.privacyRow, compact && styles.privacyRowCompact]}>
              <Text style={styles.privacyTitle}>Privacy-first by design</Text>
              <Text style={styles.privacy}>Screens are read on-device first. Raw screenshots are not sent to AI by default.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAF9' },
  scrollContent: { flexGrow: 1 },
  demoSection: { backgroundColor: '#F5F5F4', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, paddingTop: Platform.OS === 'ios' ? 52 : 32, paddingBottom: 10, minHeight: 456 },
  demoSectionCompact: { minHeight: 405, paddingTop: Platform.OS === 'ios' ? 44 : 24, paddingBottom: 6 },
  demoSectionVeryCompact: { minHeight: 340, paddingTop: Platform.OS === 'ios' ? 36 : 18 },
  brandRow: { paddingHorizontal: 22, marginBottom: 1 },
  brandRowCompact: { paddingHorizontal: 20 },
  brand: { fontSize: 13, fontWeight: '700', color: colors.text, letterSpacing: -0.1 },
  brandTag: { fontSize: 10.5, color: colors.textFaint, marginTop: 3 },
  authSection: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 32, backgroundColor: colors.canvas },
  authSectionCompact: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 22 },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: -0.7, fontWeight: '700', color: colors.text },
  titleCompact: { fontSize: 23, lineHeight: 28, letterSpacing: -0.55 },
  copy: { fontSize: 13.5, color: colors.textMuted, lineHeight: 20, marginTop: 8, marginBottom: 21, maxWidth: 348 },
  copyCompact: { fontSize: 12.8, lineHeight: 18.5, marginTop: 6, marginBottom: 16 },
  providerButton: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  emailProviderButton: { marginTop: 10 },
  providerButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  providerButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  emailForm: { marginTop: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingVertical: 12.5, paddingHorizontal: 14, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 9 },
  primaryButton: { minHeight: 49, backgroundColor: colors.black, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  message: { fontSize: 12.5, color: colors.success, marginTop: 11, lineHeight: 18 },
  messageError: { color: colors.danger },
  toggleText: { fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', marginTop: 16, fontWeight: '500' },
  toggleTextCompact: { marginTop: 13 },
  privacyRow: { alignItems: 'center', marginTop: 22 },
  privacyRowCompact: { marginTop: 16 },
  privacyTitle: { fontSize: 10.5, color: colors.textSecondary, fontWeight: '700' },
  privacy: { marginTop: 4, fontSize: 10.5, color: colors.textFaint, textAlign: 'center', lineHeight: 15, maxWidth: 310 },
})

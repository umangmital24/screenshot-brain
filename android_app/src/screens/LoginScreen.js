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

const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
  '295083436259-48boa1abgmoq9jla0nr58rhmh6v06if0.apps.googleusercontent.com'

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
})

function PasswordField({ value, onChangeText, placeholder = 'Password' }) {
  const [visible, setVisible] = useState(false)

  return (
    <View style={styles.passwordWrap}>
      <TextInput
        style={styles.passwordInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
      />
      <TouchableOpacity
        style={styles.passwordToggle}
        onPress={() => setVisible((current) => !current)}
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  )
}

export default function LoginScreen({ recoveryMode = false, onRecoveryComplete }) {
  const { height } = useWindowDimensions()
  const compact = height < 760
  const veryCompact = height < 690

  const [mode, setMode] = useState('signin')
  const [emailModeOpen, setEmailModeOpen] = useState(recoveryMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  async function handleGoogleSignIn() {
    setMessage(null)
    setGoogleLoading(true)
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const response = await GoogleSignin.signIn()
      const idToken = response.data?.idToken ?? response.idToken
      if (!idToken) throw new Error('Google did not return an ID token. Please try again.')

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })
      if (error) throw error
    } catch (err) {
      const raw = err?.message || 'Google sign-in failed'
      const messageText = raw.includes('DEVELOPER_ERROR') || raw.includes('10:')
        ? 'Google sign-in configuration does not match this Android build. Please install the latest build.'
        : raw
      setMessage({ text: messageText, error: true })
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleForgotPassword() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setEmailModeOpen(true)
      setMessage({ text: 'Enter your email first, then tap Forgot password.', error: true })
      return
    }

    setMessage(null)
    setForgotLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: 'screenshotmemory://auth/reset',
      })
      if (error) throw error
      setMessage({ text: 'Password reset link sent. Open the email on this phone to choose a new password.', error: false })
    } catch (err) {
      setMessage({ text: err?.message || 'Could not send the reset email.', error: true })
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleRecoverySubmit() {
    setMessage(null)
    if (password.length < 6) {
      setMessage({ text: 'Use at least 6 characters for your new password.', error: true })
      return
    }
    if (password !== confirmPassword) {
      setMessage({ text: 'Passwords do not match.', error: true })
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMessage({ text: 'Password updated successfully.', error: false })
      setPassword('')
      setConfirmPassword('')
      onRecoveryComplete?.()
    } catch (err) {
      setMessage({ text: err?.message || 'Could not update your password.', error: true })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit() {
    setMessage(null)
    setSubmitting(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: 'screenshotmemory://' },
        })
        if (error) throw error
        setMessage({ text: 'Account created. Check your email to confirm it.', error: false })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (error) throw error
      }
    } catch (err) {
      setMessage({ text: err?.message || 'Something went wrong', error: true })
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
        <View style={[styles.hero, compact && styles.heroCompact, veryCompact && styles.heroVeryCompact]}>
          <View style={styles.brandRow}>
            <Text style={styles.brand}>Samhaal</Text>
            <Text style={styles.brandTag}>Remember what you save.</Text>
          </View>
          <AuthProductDemo />
        </View>

        <View style={[styles.authSheet, compact && styles.authSheetCompact]}>
          <Text style={[styles.title, compact && styles.titleCompact]}>
            {recoveryMode ? 'Choose a new password.' : isSignup ? 'Create your memory space.' : 'From screenshot to memory.'}
          </Text>
          <Text style={[styles.copy, compact && styles.copyCompact]}>
            {recoveryMode
              ? 'Set a new password for your Samhaal account.'
              : 'Save anything from any app. Samhaal turns it into a memory you can find and ask about later.'}
          </Text>

          {recoveryMode ? (
            <View style={styles.emailForm}>
              <PasswordField value={password} onChangeText={setPassword} placeholder="New password" />
              <PasswordField value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" />
              <TouchableOpacity style={styles.primaryButton} onPress={handleRecoverySubmit} disabled={submitting} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Update password</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.providerButton} onPress={handleGoogleSignIn} disabled={googleLoading} activeOpacity={0.82}>
                {googleLoading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <View style={styles.providerButtonContent}>
                    <View style={styles.providerIcon}><FontAwesome name="google" size={17} color="#4285F4" /></View>
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
                activeOpacity={0.82}
              >
                <View style={styles.providerButtonContent}>
                  <View style={styles.providerIcon}><Ionicons name="mail-outline" size={18} color={colors.text} /></View>
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
                    autoCorrect={false}
                  />
                  <PasswordField value={password} onChangeText={setPassword} />
                  {!isSignup ? (
                    <TouchableOpacity onPress={handleForgotPassword} disabled={forgotLoading} style={styles.forgotButton}>
                      {forgotLoading ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.forgotText}>Forgot password?</Text>}
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
                    {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{isSignup ? 'Create account' : 'Sign in'}</Text>}
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}

          {message && <Text style={[styles.message, message.error && styles.messageError]}>{message.text}</Text>}

          {!recoveryMode ? (
            <TouchableOpacity
              onPress={() => {
                setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
                setEmailModeOpen(true)
                setMessage(null)
              }}
            >
              <Text style={styles.toggleText}>
                {isSignup ? 'Already have an account? Sign in' : 'New to Samhaal? Create an account'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {!veryCompact ? (
            <View style={styles.privacyRow}>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.textMuted} />
              <Text style={styles.privacy}>Raw screenshots are not sent to AI by default.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F3F1' },
  scrollContent: { flexGrow: 1, backgroundColor: '#F3F3F1' },
  hero: {
    minHeight: 510,
    backgroundColor: '#F3F3F1',
    paddingTop: Platform.OS === 'ios' ? 54 : 30,
    paddingBottom: 40,
  },
  heroCompact: { minHeight: 455, paddingTop: Platform.OS === 'ios' ? 44 : 22, paddingBottom: 34 },
  heroVeryCompact: { minHeight: 400, paddingTop: Platform.OS === 'ios' ? 36 : 16, paddingBottom: 28 },
  brandRow: { paddingHorizontal: 24, marginBottom: 8 },
  brand: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  brandTag: { fontSize: 11, color: colors.textFaint, marginTop: 3 },

  authSheet: {
    marginTop: -28,
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 32,
    minHeight: 350,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 3,
  },
  authSheetCompact: { paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 29, lineHeight: 34, letterSpacing: -0.9, fontWeight: '800', color: colors.text, maxWidth: 355 },
  titleCompact: { fontSize: 26, lineHeight: 31 },
  copy: { fontSize: 13.5, color: colors.textMuted, lineHeight: 20, marginTop: 9, marginBottom: 22, maxWidth: 350 },
  copyCompact: { marginBottom: 18 },

  providerButton: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
  },
  emailProviderButton: { marginTop: 10 },
  providerButtonContent: { flexDirection: 'row', alignItems: 'center' },
  providerIcon: { width: 28, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  providerButtonText: { color: colors.text, fontSize: 14, fontWeight: '650' },

  emailForm: { marginTop: 14 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, fontSize: 14, color: colors.text, backgroundColor: colors.surface, marginBottom: 9 },
  passwordWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, marginBottom: 9, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingVertical: 13, paddingLeft: 14, paddingRight: 4, fontSize: 14, color: colors.text },
  passwordToggle: { width: 46, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  forgotButton: { alignSelf: 'flex-end', minHeight: 34, justifyContent: 'center', marginTop: -2, marginBottom: 5 },
  forgotText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
  primaryButton: { minHeight: 50, backgroundColor: colors.black, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  message: { fontSize: 12.5, color: colors.success, marginTop: 11, lineHeight: 18 },
  messageError: { color: colors.danger },
  toggleText: { fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', marginTop: 18, fontWeight: '500' },
  privacyRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  privacy: { fontSize: 10.5, color: colors.textFaint },
})

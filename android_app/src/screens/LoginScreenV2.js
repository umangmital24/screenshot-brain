import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { FontAwesome, Ionicons } from '@expo/vector-icons'
import { supabase } from '../supabaseClient'
import { colors } from '../theme'

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '295083436259-48boa1abgmoq9jla0nr58rhmh6v06if0.apps.googleusercontent.com'
GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false })

function PasswordField({ value, onChangeText, placeholder = 'Password' }) {
  const [visible, setVisible] = useState(false)
  return <View style={styles.passwordWrap}><TextInput style={styles.passwordInput} placeholder={placeholder} placeholderTextColor={colors.textFaint} value={value} onChangeText={onChangeText} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} /><TouchableOpacity style={styles.passwordToggle} onPress={() => setVisible((v) => !v)}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} /></TouchableOpacity></View>
}

export default function LoginScreenV2({ recoveryMode = false, onRecoveryComplete }) {
  const [mode, setMode] = useState('signin')
  const [emailOpen, setEmailOpen] = useState(recoveryMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  async function googleSignIn() {
    setMessage(null); setGoogleLoading(true)
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const response = await GoogleSignin.signIn()
      const idToken = response.data?.idToken ?? response.idToken
      if (!idToken) throw new Error('Google did not return an ID token. Please try again.')
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
      if (error) throw error
    } catch (err) {
      const raw = err?.message || 'Google sign-in failed'
      setMessage({ text: raw.includes('DEVELOPER_ERROR') || raw.includes('10:') ? 'Google sign-in configuration does not match this Android build. Please install the latest build.' : raw, error: true })
    } finally { setGoogleLoading(false) }
  }

  async function forgotPassword() {
    const normalized = email.trim().toLowerCase()
    if (!normalized) { setEmailOpen(true); setMessage({ text: 'Enter your email first, then tap Forgot password.', error: true }); return }
    setForgotLoading(true); setMessage(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo: 'screenshotmemory://auth/reset' })
      if (error) throw error
      setMessage({ text: 'Password reset link sent. Open the email on this phone.', error: false })
    } catch (err) { setMessage({ text: err?.message || 'Could not send the reset email.', error: true }) }
    finally { setForgotLoading(false) }
  }

  async function submitRecovery() {
    if (password.length < 6) return setMessage({ text: 'Use at least 6 characters for your new password.', error: true })
    if (password !== confirmPassword) return setMessage({ text: 'Passwords do not match.', error: true })
    setSubmitting(true); setMessage(null)
    try { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; setMessage({ text: 'Password updated successfully.', error: false }); onRecoveryComplete?.() }
    catch (err) { setMessage({ text: err?.message || 'Could not update your password.', error: true }) }
    finally { setSubmitting(false) }
  }

  async function submitEmail() {
    setSubmitting(true); setMessage(null)
    try {
      const normalized = email.trim().toLowerCase()
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: normalized, password, options: { emailRedirectTo: 'screenshotmemory://' } })
        if (error) throw error
        setMessage({ text: 'Account created. Check your email to confirm it.', error: false })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalized, password })
        if (error) throw error
      }
    } catch (err) { setMessage({ text: err?.message || 'Something went wrong', error: true }) }
    finally { setSubmitting(false) }
  }

  const signup = mode === 'signup'

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}><Image source={require('../../assets/icon.png')} style={styles.logo} /><View><View style={styles.wordRow}><Text style={styles.brand}>Samhaal</Text><Text style={styles.hindi}>संभाल</Text></View><Text style={styles.micro}>Remember what you save.</Text></View></View>

        <Text style={styles.title}>{recoveryMode ? 'Choose a new password.' : 'Turn your screenshots into searchable memories.'}</Text>
        <Text style={styles.subtitle}>{recoveryMode ? 'Set a new password for your Samhaal account.' : 'Capture. Save. Find. Anytime.'}</Text>

        {!recoveryMode ? <View style={styles.previewStack}><View style={[styles.previewCard, { transform: [{ rotate: '-3deg' }] }]}><Ionicons name="book-outline" size={22} color={colors.text} /><Text style={styles.previewText}>That book list</Text></View><View style={[styles.previewCard, styles.previewCardMiddle]}><Ionicons name="briefcase-outline" size={22} color={colors.text} /><Text style={styles.previewText}>AI job post</Text></View><View style={[styles.previewCard, { transform: [{ rotate: '3deg' }] }]}><Ionicons name="restaurant-outline" size={22} color={colors.text} /><Text style={styles.previewText}>Pasta recipe</Text></View></View> : null}

        {recoveryMode ? <View style={styles.form}><PasswordField value={password} onChangeText={setPassword} placeholder="New password" /><PasswordField value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" /><TouchableOpacity style={styles.primary} onPress={submitRecovery} disabled={submitting}>{submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Update password</Text>}</TouchableOpacity></View> : <>
          <TouchableOpacity style={styles.googleButton} onPress={googleSignIn} disabled={googleLoading}>{googleLoading ? <ActivityIndicator color={colors.white} /> : <><View style={styles.googleIcon}><FontAwesome name="google" size={17} color="#4285F4" /></View><Text style={styles.googleText}>Continue with Google</Text></>}</TouchableOpacity>
          <View style={styles.orRow}><View style={styles.line} /><Text style={styles.or}>or</Text><View style={styles.line} /></View>
          <TouchableOpacity style={styles.emailButton} onPress={() => { setEmailOpen((v) => !v); setMessage(null) }}><Ionicons name="mail-outline" size={19} color={colors.text} /><Text style={styles.emailButtonText}>Continue with Email</Text></TouchableOpacity>
          {emailOpen ? <View style={styles.form}><TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textFaint} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><PasswordField value={password} onChangeText={setPassword} />{!signup ? <TouchableOpacity style={styles.forgot} onPress={forgotPassword} disabled={forgotLoading}>{forgotLoading ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.forgotText}>Forgot password?</Text>}</TouchableOpacity> : null}<TouchableOpacity style={styles.primary} onPress={submitEmail} disabled={submitting}>{submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{signup ? 'Create account' : 'Sign in'}</Text>}</TouchableOpacity></View> : null}
          <TouchableOpacity style={styles.modeToggle} onPress={() => { setMode(signup ? 'signin' : 'signup'); setEmailOpen(true); setMessage(null) }}><Text style={styles.modeText}>{signup ? 'Already have an account? Sign in' : 'New to Samhaal? Create an account'}</Text></TouchableOpacity>
        </>}

        {message ? <Text style={[styles.message, message.error && styles.messageError]}>{message.text}</Text> : null}
        {!recoveryMode ? <Text style={styles.legal}>By continuing, you agree to our Terms of Service and Privacy Policy.</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 54, height: 54, borderRadius: 14 },
  wordRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  brand: { fontSize: 24, fontWeight: '700', letterSpacing: -0.55, color: colors.text },
  hindi: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  micro: { marginTop: 2, fontSize: 11.5, color: colors.textFaint },
  title: { marginTop: 38, maxWidth: 360, fontSize: 34, lineHeight: 40, letterSpacing: -1.25, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 10, fontSize: 15, color: colors.textMuted },
  previewStack: { marginTop: 30, height: 122, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  previewCard: { width: 112, height: 94, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface, padding: 14, justifyContent: 'space-between', marginHorizontal: -7, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  previewCardMiddle: { zIndex: 2, transform: [{ translateY: -7 }] },
  previewText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.text },
  googleButton: { marginTop: 28, minHeight: 58, borderRadius: 16, backgroundColor: colors.black, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  googleText: { fontSize: 15, color: colors.white, fontWeight: '700' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  line: { flex: 1, height: 1, backgroundColor: colors.borderSubtle },
  or: { fontSize: 12.5, color: colors.textFaint },
  emailButton: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  emailButtonText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  form: { marginTop: 18, gap: 12 },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 15, fontSize: 14.5, color: colors.text },
  passwordWrap: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingHorizontal: 15, fontSize: 14.5, color: colors.text },
  passwordToggle: { width: 48, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600' },
  primary: { minHeight: 54, borderRadius: 14, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  primaryText: { color: colors.white, fontSize: 14.5, fontWeight: '700' },
  modeToggle: { paddingVertical: 17, alignItems: 'center' },
  modeText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
  message: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  messageError: { backgroundColor: '#FFF8F8', color: '#B91C1C' },
  legal: { marginTop: 'auto', paddingTop: 22, textAlign: 'center', fontSize: 11, lineHeight: 16, color: colors.textFaint },
})

import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { FontAwesome, Ionicons } from '@expo/vector-icons'
import { supabase } from '../supabaseClient'
import { colors } from '../theme'

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '295083436259-48boa1abgmoq9jla0nr58rhmh6v06if0.apps.googleusercontent.com'
GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false })

function SamhaalLogo({ size = 82 }) {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.18 }]}>
      <Ionicons name="leaf-outline" size={size * 0.56} color="#FFFFFF" style={{ transform: [{ rotate: '-28deg' }] }} />
    </View>
  )
}

function PasswordField({ value, onChangeText, placeholder = 'Password' }) {
  const [visible, setVisible] = useState(false)
  return <View style={styles.passwordWrap}><TextInput style={styles.passwordInput} placeholder={placeholder} placeholderTextColor={colors.textFaint} value={value} onChangeText={onChangeText} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} /><TouchableOpacity style={styles.passwordToggle} onPress={() => setVisible((v) => !v)}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} /></TouchableOpacity></View>
}

function MemoryCollage() {
  return (
    <View style={styles.collage}>
      <View style={[styles.memoryCard, styles.travelCard]}>
        <View style={styles.mountainArt}><Ionicons name="image-outline" size={31} color="#111111" /></View>
        <Text style={styles.cardCaption}>Mountain trip</Text>
      </View>
      <View style={[styles.memoryCard, styles.shoeCard]}>
        <Ionicons name="footsteps-outline" size={37} color="#111111" />
        <Text style={styles.cardCaption}>Nike Pegasus 41</Text>
      </View>
      <View style={[styles.memoryCard, styles.coffeeCard]}>
        <Ionicons name="cafe-outline" size={35} color="#111111" />
        <Text style={styles.cardCaption}>Blue Tokai</Text>
      </View>
      <View style={[styles.memoryCard, styles.codeCard]}>
        <Text style={styles.codeText}>def main():{`\n`}  print("Hello"){`\n`}  return True</Text>
      </View>
      <View style={[styles.memoryCard, styles.ideaCard]}>
        <Text style={styles.ideaTitle}>Project Ideas</Text>
        <Text style={styles.ideaText}>□ Build habit tracker{`\n`}□ Explore LLMs{`\n`}□ Redesign portfolio</Text>
      </View>
    </View>
  )
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
        <View style={styles.brandRow}><Text style={styles.brand}>Samhaal</Text><Text style={styles.hindi}>संभाल</Text></View>

        <View style={styles.hero}>
          <SamhaalLogo />
          <Text style={styles.title}>{recoveryMode ? 'Choose a new password.' : 'Turn your screenshots\ninto searchable\nmemories.'}</Text>
          <Text style={styles.subtitle}>{recoveryMode ? 'Set a new password for your Samhaal account.' : 'Capture. Save. Find. Anytime.'}</Text>
        </View>

        {!recoveryMode && !emailOpen ? <MemoryCollage /> : null}

        {recoveryMode ? <View style={styles.form}><PasswordField value={password} onChangeText={setPassword} placeholder="New password" /><PasswordField value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" /><TouchableOpacity style={styles.primary} onPress={submitRecovery} disabled={submitting}>{submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Update password</Text>}</TouchableOpacity></View> : <>
          <TouchableOpacity style={styles.googleButton} onPress={googleSignIn} disabled={googleLoading}>{googleLoading ? <ActivityIndicator color={colors.white} /> : <><View style={styles.googleIcon}><FontAwesome name="google" size={17} color="#4285F4" /></View><Text style={styles.googleText}>Continue with Google</Text></>}</TouchableOpacity>
          <View style={styles.orRow}><View style={styles.line} /><Text style={styles.or}>or</Text><View style={styles.line} /></View>
          <TouchableOpacity style={styles.emailButton} onPress={() => { setEmailOpen((v) => !v); setMessage(null) }}><Ionicons name="mail-outline" size={19} color={colors.text} /><Text style={styles.emailButtonText}>Continue with Email</Text></TouchableOpacity>
          {emailOpen ? <View style={styles.form}><TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textFaint} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><PasswordField value={password} onChangeText={setPassword} />{!signup ? <TouchableOpacity style={styles.forgot} onPress={forgotPassword} disabled={forgotLoading}>{forgotLoading ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.forgotText}>Forgot password?</Text>}</TouchableOpacity> : null}<TouchableOpacity style={styles.primary} onPress={submitEmail} disabled={submitting}>{submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{signup ? 'Create account' : 'Sign in'}</Text>}</TouchableOpacity></View> : null}
          <TouchableOpacity style={styles.modeToggle} onPress={() => { setMode(signup ? 'signin' : 'signup'); setEmailOpen(true); setMessage(null) }}><Text style={styles.modeText}>{signup ? 'Already have an account? Sign in' : 'New to Samhaal? Create an account'}</Text></TouchableOpacity>
        </>}

        {message ? <Text style={[styles.message, message.error && styles.messageError]}>{message.text}</Text> : null}
        {!recoveryMode ? <Text style={styles.legal}>By continuing, you agree to our{`\n`}<Text style={styles.legalLink}>Terms of Service</Text> and <Text style={styles.legalLink}>Privacy Policy</Text>.</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 48, paddingBottom: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 },
  brand: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7, color: '#080808' },
  hindi: { fontSize: 17, fontWeight: '500', color: '#777B86' },
  hero: { alignItems: 'center', marginTop: 26 },
  logo: { backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 24, textAlign: 'center', fontSize: 30, lineHeight: 33, letterSpacing: -1.05, fontWeight: '800', color: '#080808' },
  subtitle: { marginTop: 10, fontSize: 16, color: '#777B86', textAlign: 'center' },
  collage: { alignSelf: 'center', width: 290, height: 166, marginTop: 22, position: 'relative' },
  memoryCard: { position: 'absolute', borderRadius: 10, borderWidth: 1, borderColor: '#ECECEC', backgroundColor: '#FFFFFF', padding: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  travelCard: { width: 112, height: 88, left: 22, top: 4, transform: [{ rotate: '-8deg' }] },
  shoeCard: { width: 102, height: 82, right: 24, top: 9, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }] },
  coffeeCard: { width: 96, height: 74, left: 7, bottom: 5, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '5deg' }] },
  codeCard: { width: 116, height: 80, left: 91, top: 72, backgroundColor: '#0A0A0A', borderColor: '#0A0A0A', transform: [{ rotate: '-2deg' }], zIndex: 4 },
  ideaCard: { width: 105, height: 82, right: 0, bottom: 0, transform: [{ rotate: '4deg' }], zIndex: 3 },
  mountainArt: { flex: 1, backgroundColor: '#F3F3F3', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cardCaption: { fontSize: 8.5, marginTop: 4, fontWeight: '700', color: '#111111' },
  codeText: { fontSize: 8.5, lineHeight: 13, color: '#FFFFFF', fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
  ideaTitle: { fontSize: 9.5, fontWeight: '800', color: '#111111', marginBottom: 4 },
  ideaText: { fontSize: 7.5, lineHeight: 12, color: '#222222' },
  googleButton: { marginTop: 22, minHeight: 58, borderRadius: 14, backgroundColor: '#080808', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 },
  googleIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  googleText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 13 },
  line: { flex: 1, height: 1, backgroundColor: '#E1E1E1' },
  or: { fontSize: 13, color: '#777B86' },
  emailButton: { minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: '#DADADA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFFFFF' },
  emailButtonText: { fontSize: 15.5, color: '#111111', fontWeight: '500' },
  form: { marginTop: 16, gap: 11 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#DADADA', borderRadius: 13, paddingHorizontal: 15, fontSize: 14.5, color: '#111111' },
  passwordWrap: { minHeight: 52, borderWidth: 1, borderColor: '#DADADA', borderRadius: 13, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingHorizontal: 15, fontSize: 14.5, color: '#111111' },
  passwordToggle: { width: 48, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { fontSize: 12.5, color: '#666A73', fontWeight: '600' },
  primary: { minHeight: 52, borderRadius: 13, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  primaryText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
  modeToggle: { paddingVertical: 13, alignItems: 'center' },
  modeText: { fontSize: 12.5, color: '#5F636B', fontWeight: '600' },
  message: { marginTop: 8, padding: 11, borderRadius: 11, backgroundColor: '#F5F5F5', color: '#555555', fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  messageError: { backgroundColor: '#FFF8F8', color: '#B91C1C' },
  legal: { marginTop: 'auto', paddingTop: 16, textAlign: 'center', fontSize: 11.5, lineHeight: 17, color: '#777B86' },
  legalLink: { textDecorationLine: 'underline', color: '#555A63' },
})
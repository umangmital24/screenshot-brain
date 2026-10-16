import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// Matches GOOGLE_WEB_CLIENT_ID in Android's LoginScreen.js on main.
// This is a public OAuth Client ID, not a Google Client Secret.
const GOOGLE_WEB_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID?.trim() ||
  '295083436259-48boa1abgmoq9jla0nr58rhmh6v06if0.apps.googleusercontent.com'

export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [googleWorking, setGoogleWorking] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const googleButtonRef = useRef(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) window.location.replace('/dashboard')
    })
    return () => { active = false }
  }, [])

  async function handleEmail(event) {
    event.preventDefault()
    if (!supabase || working) return
    setWorking(true)
    setMessage('')
    setNotice('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: window.location.origin + '/auth/callback' },
        })
        if (error) throw error
        setNotice('Check your email to confirm your Samhaal account, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (error) throw error
        window.location.replace('/dashboard')
      }
    } catch (error) {
      setMessage(error?.message || 'Could not sign in. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  // Google Identity Services returns an ID token directly. This is the same
  // Supabase Auth path the Android app uses; it does not rely on Google's
  // OAuth authorization-code exchange or the server-side Client Secret.
  useEffect(() => {
    if (!supabase || !GOOGLE_WEB_CLIENT_ID) return
    let active = true
    const container = googleButtonRef.current
    const scriptId = 'samhaal-google-identity-script'

    async function onGoogleCredential(response) {
      if (!active || !response?.credential) {
        if (active) setMessage('Google did not return a sign-in token. Please try again.')
        return
      }
      setGoogleWorking(true)
      setMessage('')
      try {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
        })
        if (error) throw error
        if (active) window.location.replace('/dashboard')
      } catch (error) {
        if (active) {
          setMessage(error?.message || 'Google sign-in failed. Please try again.')
          setGoogleWorking(false)
        }
      }
    }

    function initializeGoogle() {
      if (!active || !container || !window.google?.accounts?.id) return
      container.replaceChildren()
      window.google.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        callback: onGoogleCredential,
        auto_select: false,
        context: 'signin',
      })
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        width: Math.min(370, Math.max(220, container.clientWidth || 320)),
      })
      setGoogleReady(true)
    }

    if (window.google?.accounts?.id) {
      initializeGoogle()
    } else {
      let script = document.getElementById(scriptId)
      if (!script) {
        script = document.createElement('script')
        script.id = scriptId
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', initializeGoogle)
      script.addEventListener('error', () => {
        if (active) setMessage('Google sign-in could not load. Check your browser or try email sign-in.')
      })
      return () => {
        active = false
        script.removeEventListener('load', initializeGoogle)
        container?.replaceChildren()
      }
    }
    return () => { active = false; container?.replaceChildren() }
  }, [])


  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <a className="portal-brand" href="/">Samhaal <span>संभाल</span></a>
        <a href="/get-app" className="portal-text-link">Get App →</a>
      </header>
      <section className="portal-auth-card" aria-labelledby="login-title">
        <p className="portal-eyebrow">YOUR PRIVATE MEMORY SPACE</p>
        <h1 id="login-title">{mode === 'signup' ? 'Create your account.' : 'Welcome back.'}</h1>
        <p className="portal-muted">Use the same Samhaal account as your Android app to access your saved memories.</p>
        {!supabase ? (
          <p className="portal-error" role="alert">Web login has not been configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for this deployment.</p>
        ) : (
          <>
            <div className="portal-google-slot" ref={googleButtonRef} aria-label="Continue with Google" />
            {!googleReady && !message && <p className="portal-google-loading">Loading Google sign-in…</p>}
            {googleWorking && <p className="portal-google-loading" role="status">Signing you in with Google…</p>}
            <div className="portal-divider">or continue with email</div>
            <form className="portal-form" onSubmit={handleEmail}>
              <label htmlFor="samhaal-email">Email address</label>
              <input id="samhaal-email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
              <label htmlFor="samhaal-password">Password</label>
              <input id="samhaal-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} placeholder="Your password" required value={password} onChange={e => setPassword(e.target.value)} />
              <button className="portal-button portal-primary" type="submit" disabled={working}>
                {working ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
              </button>
            </form>
            {message && <p className="portal-error" role="alert">{message}</p>}
            {notice && <p className="portal-success" role="status">{notice}</p>}
            <p className="portal-auth-switch">
              {mode === 'signup' ? 'Already have an account?' : 'New to Samhaal?'}{' '}
              <button type="button" className="portal-inline-button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); setNotice('') }}>
                {mode === 'signup' ? 'Log in' : 'Create one'}
              </button>
            </p>
          </>
        )}
        <p className="portal-privacy-note">Original screenshots stay on your phone. Samhaal Web accesses only your synced memories.</p>
      </section>
    </main>
  )
}

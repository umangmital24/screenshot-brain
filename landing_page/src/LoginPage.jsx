import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [linkWorking, setLinkWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) window.location.replace('/dashboard')
    })
    return () => { active = false }
  }, [])

  async function handleEmail(event) {
    event.preventDefault()
    if (working || linkWorking) return
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

  async function handleEmailLink(event) {
    event.preventDefault()
    if (linkWorking || working) return
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setMessage('Enter the email address you use on your Samhaal Android account.')
      return
    }
    setLinkWorking(true)
    setMessage('')
    setNotice('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          // Never create a second user when the Android account already exists.
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + '/auth/callback',
        },
      })
      if (error) throw error
      setNotice('Check your inbox for a Samhaal sign-in link. Open it in this same browser to finish signing in.')
    } catch (error) {
      setMessage(error?.message || 'Could not send a sign-in link. Try email/password login instead.')
    } finally {
      setLinkWorking(false)
    }
  }

  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <a className="portal-brand portal-brand-with-logo" href="/"><img className="portal-brand-logo" src="/samhaal-logo.svg" alt="" /> <span>Samhaal <span>संभाल</span></span></a>
        <a href="/get-app" className="portal-text-link">Get App →</a>
      </header>
      <section className="portal-auth-card" aria-labelledby="login-title">
        <p className="portal-eyebrow">YOUR PRIVATE MEMORY SPACE</p>
        <h1 id="login-title">{mode === 'signup' ? 'Create your account.' : 'Welcome back.'}</h1>
        <p className="portal-muted">Use the same email as your Android Samhaal account to access your saved memories.</p>

        {mode === 'login' && (
          <form className="portal-form" onSubmit={handleEmailLink}>
            <label htmlFor="samhaal-link-email">Your Samhaal account email</label>
            <input id="samhaal-link-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="portal-button portal-primary" type="submit" disabled={linkWorking || working}>
              {linkWorking ? 'Sending sign-in link…' : 'Email me a sign-in link'}
            </button>
            <p className="portal-email-hint">Signed up on Android with Google? Use that same Gmail address. No Google Console access is needed for this method.</p>
          </form>
        )}

        <div className="portal-divider">{mode === 'signup' ? 'create with email' : 'or use your password'}</div>
        <form className="portal-form" onSubmit={handleEmail}>
          {mode === 'signup' && (
            <>
              <label htmlFor="samhaal-email">Email address</label>
              <input id="samhaal-email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
            </>
          )}
          <label htmlFor="samhaal-password">Password</label>
          <input id="samhaal-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} placeholder="Your password" required value={password} onChange={e => setPassword(e.target.value)} />
          <button className="portal-button portal-outline" type="submit" disabled={working || linkWorking}>
            {working ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in with password'}
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
        <p className="portal-privacy-note">Google sign-in on the website is temporarily unavailable until its browser origin is authorized. Google sign-in on Android is unaffected. Original screenshots remain on your phone.</p>
      </section>
    </main>
  )
}

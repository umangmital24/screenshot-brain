import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
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

  async function handleGoogle() {
    if (!supabase || working) return
    setWorking(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/auth/callback' },
      })
      if (error) throw error
    } catch (error) {
      setMessage(error?.message || 'Google sign-in failed.')
      setWorking(false)
    }
  }

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
            <button className="portal-button portal-google" type="button" disabled={working} onClick={handleGoogle}>
              Continue with Google
            </button>
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

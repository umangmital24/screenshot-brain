import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import MemoryUniverse from './MemoryUniverse'

// The browser uses the same Supabase identity as Samhaal Android.
// Google browser sign-in stays disabled until the domain is authorized by Google.


export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [loginMethod, setLoginMethod] = useState('magic')
  const [attention, setAttention] = useState('idle')
  const [showPassword, setShowPassword] = useState(false)
  const passwordInputRef = useRef(null)
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
    }).catch(() => {
      // An unavailable session should not stop the user from logging in.
    })
    return () => { active = false }
  }, [])



  function switchLoginMethod(next) {
    setLoginMethod(next)
    setAttention('idle')
    setShowPassword(false)
    setMessage('')
    setNotice('')
  }

  function switchMode() {
    setMode(current => current === 'login' ? 'signup' : 'login')
    setAttention('idle')
    setShowPassword(false)
    setMessage('')
    setNotice('')
    setPassword('')
  }

  function togglePasswordVisibility() {
    setShowPassword(visible => !visible)
    setAttention('password')
    // Keep the password field active so the universe's vault/peek state
    // responds to the toggle rather than the button taking focus.
    passwordInputRef.current?.focus({ preventScroll: true })
  }

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
      setMessage('Enter the email address you use on Samhaal Android.')
      return
    }
    setLinkWorking(true)
    setMessage('')
    setNotice('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          // Reuse the existing Android user instead of creating a duplicate.
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + '/auth/callback',
        },
      })
      if (error) throw error
      setNotice('Your sign-in link is on its way. Check your inbox and open it in this browser.')
    } catch (error) {
      setMessage(error?.message || 'Could not send a sign-in link. Try again or use your password.')
    } finally {
      setLinkWorking(false)
    }
  }

  const creatingAccount = mode === 'signup'
  const usePassword = creatingAccount || loginMethod === 'password'
  const busy = working || linkWorking

  return (
    <main className="portal-shell portal-auth-shell">
      <header className="portal-topbar portal-auth-topbar">
        <a className="portal-brand portal-brand-with-logo" href="/" aria-label="Samhaal homepage">
          <img className="portal-brand-logo" src="/samhaal-logo.svg" alt="" />
          <span>Samhaal <span>संभाल</span></span>
        </a>
        <a href="/get-app" className="portal-text-link">Get App <span aria-hidden="true">↗</span></a>
      </header>

      <div className="portal-auth-stage">
        <aside className="portal-auth-visual" aria-label="Discover what Samhaal remembers">
          <div className="portal-auth-orbit portal-auth-orbit-one" aria-hidden="true" />
          <div className="portal-auth-orbit portal-auth-orbit-two" aria-hidden="true" />
          <div className="portal-auth-orbit portal-auth-orbit-three" aria-hidden="true" />
          <div className="portal-auth-visual-content">
            <span className="portal-visual-eyebrow"><span className="portal-visual-star">✦</span> YOUR SECOND BRAIN</span>
            <h2>Save the moment.<br /><em>Remember the meaning.</em></h2>
            <p className="portal-visual-copy">
              Books, movies, places, and ideas. Samhaal turns the screenshots you save into memories you can find again.
            </p>

            <MemoryUniverse attention={attention} passwordVisible={usePassword && showPassword} feedback={notice ? 'sent' : message ? 'error' : ''} />

            <div className="portal-visual-trust">
              <span className="portal-trust-icon" aria-hidden="true">✓</span>
              <div><strong>Private by design</strong><span>Original screenshots stay on your phone.</span></div>
            </div>
          </div>
        </aside>

        <section className="portal-auth-card portal-auth-card-compact" aria-labelledby="login-title">
          <div className="portal-auth-card-inner">
            <MemoryUniverse attention={attention} passwordVisible={usePassword && showPassword} feedback={notice ? 'sent' : message ? 'error' : ''} compact />
            <p className="portal-eyebrow">YOUR PRIVATE MEMORY SPACE</p>
            <h1 id="login-title">{creatingAccount ? 'Make memories last.' : 'Welcome back.'}</h1>
            <p className="portal-muted">
              {creatingAccount
                ? 'Create an account to keep your saved memories within reach.'
                : 'Use the email linked to your Samhaal Android account.'}
            </p>

            {!creatingAccount && (
              <div className="portal-auth-switcher" role="group" aria-label="Choose a sign-in method">
                <button
                  type="button"
                  className={loginMethod === 'magic' ? 'is-active' : ''}
                  aria-pressed={loginMethod === 'magic'}
                  disabled={busy}
                  onClick={() => switchLoginMethod('magic')}
                >Email link</button>
                <button
                  type="button"
                  className={loginMethod === 'password' ? 'is-active' : ''}
                  aria-pressed={loginMethod === 'password'}
                  disabled={busy}
                  onClick={() => switchLoginMethod('password')}
                >Password</button>
              </div>
            )}

            <form className="portal-form portal-compact-form" onSubmit={usePassword ? handleEmail : handleEmailLink}>
              <label htmlFor="samhaal-auth-email">Email address</label>
              <input
                id="samhaal-auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                disabled={busy}
                onFocus={() => setAttention('email')}
                onBlur={() => setAttention('idle')}
                onChange={e => setEmail(e.target.value)}
              />
              {usePassword && (
                <>
                  <label htmlFor="samhaal-auth-password">Password</label>
                  <div className="portal-password-field">
                    <input
                      ref={passwordInputRef}
                      id="samhaal-auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={creatingAccount ? 'new-password' : 'current-password'}
                      minLength={6}
                      placeholder={creatingAccount ? 'At least 6 characters' : 'Enter your password'}
                      required
                      value={password}
                      disabled={busy}
                      onFocus={() => setAttention('password')}
                      onBlur={() => setAttention('idle')}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button
                      className="portal-password-toggle"
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      onClick={togglePasswordVisibility}
                      disabled={busy}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {showPassword
                          ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.1a10.9 10.9 0 0 1 2.1-.2c5.2 0 8.7 4.3 10 7.1a11.4 11.4 0 0 1-3.7 4.6" /><path d="M6.2 6.3A11.8 11.8 0 0 0 2 12c1.3 2.8 4.8 7.1 10 7.1 1.1 0 2.1-.2 3.1-.5" /></>
                          : <><path d="M2 12s3.7-7.1 10-7.1S22 12 22 12s-3.7 7.1-10 7.1S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
                      </svg>
                      <span>{showPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                </>
              )}
              <button className="portal-button portal-primary portal-auth-submit" type="submit" disabled={busy}>
                {busy
                  ? (linkWorking ? 'Sending link…' : 'Please wait…')
                  : creatingAccount ? 'Create account'
                  : usePassword ? 'Log in to Samhaal'
                  : 'Email me a sign-in link'}
                <span aria-hidden="true">↗</span>
              </button>
            </form>

            {message && <p className="portal-error" role="alert">{message}</p>}
            {notice && <p className="portal-success" role="status">{notice}</p>}

            {!creatingAccount && loginMethod === 'magic' && (
              <p className="portal-method-hint">Signed in on Android with Google? Use that same email. No Google Console access needed.</p>
            )}

            <p className="portal-auth-switch">
              {creatingAccount ? 'Already have a Samhaal account?' : 'New to Samhaal?'}{' '}
              <button type="button" className="portal-inline-button" disabled={busy} onClick={switchMode}>
                {creatingAccount ? 'Log in' : 'Create an account'}
              </button>
            </p>

            <div className="portal-auth-privacy">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              Your original screenshots stay on Android.
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

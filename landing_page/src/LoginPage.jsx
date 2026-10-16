import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// The browser uses the same Supabase identity as Samhaal Android.
// Google browser sign-in stays disabled until the domain is authorized by Google.

/**
 * A little Samhaal memory companion: it follows the pointer and the email
 * field, then covers its eyes when the password field has focus.
 * Only focus state and pointer position are used; no input value is observed.
 */
function MemoryCompanion({ attention, stageRef }) {
  const secret = attention === 'password'
  const reading = attention === 'email'
  const headline = secret ? 'Your secret is safe.' : reading ? 'Oh, a new memory?' : 'Your memory companion'
  const subtitle = secret
    ? "I'm looking away. Type freely."
    : reading ? 'Just making sure you feel at home.' : 'Always curious. Never intrusive.'

  return (
    <div className={'portal-companion-scene' + (secret ? ' is-secret' : '') + (reading ? ' is-reading' : '')} ref={stageRef} aria-hidden="true">
      <div className="portal-companion-halo" />
      <div className="portal-companion-grid" />
      <div className="portal-companion-memory portal-companion-memory-one">
        <span className="portal-companion-memory-symbol">▶</span>
        <span><strong>Interstellar</strong><small>Watch later</small></span>
      </div>
      <div className="portal-companion-memory portal-companion-memory-two">
        <span className="portal-companion-memory-symbol">✦</span>
        <span><strong>Remembered</strong><small>Saved to Samhaal</small></span>
      </div>
      <div className="portal-companion-sprite">
        <svg className="portal-companion-svg" viewBox="0 0 300 255" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="151" cy="239" rx="69" ry="10" fill="#08080a" opacity=".18" />
          <g className="portal-companion-leaf">
            <path d="M146 42C169 15 208 14 225 21C220 40 201 61 176 69" fill="#dbdce3" stroke="#e9eaf0" strokeWidth="3" strokeLinejoin="round" />
            <path d="M152 44C207 46 241 80 237 143C233 200 190 228 145 224C95 219 66 182 66 137C66 83 101 46 152 44Z" fill="#f9fafb" stroke="#d9dae1" strokeWidth="3" />
            <path d="M151 45C151 82 146 113 128 143" stroke="#d5d7de" strokeWidth="2" strokeLinecap="round" opacity=".55" />
            <ellipse cx="95" cy="157" rx="13" ry="7" fill="#f5b0b8" opacity=".32" />
            <ellipse cx="204" cy="157" rx="13" ry="7" fill="#f5b0b8" opacity=".32" />
            <g className="portal-companion-eyes">
              <ellipse cx="119" cy="139" rx="17" ry="19" fill="#e2e4e9" opacity=".65" />
              <ellipse cx="180" cy="139" rx="17" ry="19" fill="#e2e4e9" opacity=".65" />
              <g className="portal-companion-pupils">
                <ellipse cx="119" cy="140" rx="8.5" ry="11" fill="#17171c" />
                <ellipse cx="180" cy="140" rx="8.5" ry="11" fill="#17171c" />
                <circle cx="122" cy="135" r="2.7" fill="#fff" opacity=".9" />
                <circle cx="183" cy="135" r="2.7" fill="#fff" opacity=".9" />
              </g>
            </g>
            <g className="portal-companion-shy-eyes">
              <path d="M107 143Q119 151 131 141" stroke="#2a2a32" strokeWidth="4" strokeLinecap="round" />
              <path d="M168 141Q181 152 192 141" stroke="#2a2a32" strokeWidth="4" strokeLinecap="round" />
            </g>
            <path className="portal-companion-smile" d="M141 169Q150 177 161 169" stroke="#27272a" strokeWidth="3.7" strokeLinecap="round" />
            <path className="portal-companion-secret-smile" d="M144 174Q150 171 156 174" stroke="#27272a" strokeWidth="3.7" strokeLinecap="round" />
          </g>
          <g className="portal-companion-hands">
            <path d="M67 187C80 169 104 151 120 144C127 141 130 147 125 152C118 159 111 165 105 171L133 153C141 148 146 154 139 161L107 189C90 203 74 206 67 187Z" fill="#d9dce4" stroke="#adb0bc" strokeWidth="2.5" />
            <path d="M231 187C219 168 195 151 181 144C172 140 169 148 175 153L193 171L165 153C157 148 152 154 159 161L192 190C208 204 226 208 231 187Z" fill="#d9dce4" stroke="#adb0bc" strokeWidth="2.5" />
          </g>
        </svg>
        <span className="portal-companion-mood" aria-hidden="true">{secret ? '🙈' : reading ? '✉' : '✦'}</span>
      </div>
      <div className="portal-companion-caption">
        <strong>{headline}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState('login')
  const [loginMethod, setLoginMethod] = useState('magic')
  const [attention, setAttention] = useState('idle')
  const mascotStageRef = useRef(null)
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


  useEffect(() => {
    // Pointer tracking is purely decorative. Never inspect form values.
    const scene = mascotStageRef.current
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const onMove = event => {
      const bounds = scene.getBoundingClientRect()
      const relativeX = Math.max(-1, Math.min(1, (event.clientX - (bounds.left + bounds.width * .5)) / (bounds.width * .5)))
      const relativeY = Math.max(-1, Math.min(1, (event.clientY - (bounds.top + bounds.height * .5)) / (bounds.height * .5)))
      scene.style.setProperty('--pupil-x', (relativeX * 7).toFixed(1) + 'px')
      scene.style.setProperty('--pupil-y', (relativeY * 5).toFixed(1) + 'px')
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  function switchLoginMethod(next) {
    setLoginMethod(next)
    setAttention('idle')
    setMessage('')
    setNotice('')
  }

  function switchMode() {
    setMode(current => current === 'login' ? 'signup' : 'login')
    setAttention('idle')
    setMessage('')
    setNotice('')
    setPassword('')
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

            <MemoryCompanion attention={attention} stageRef={mascotStageRef} />

            <div className="portal-visual-trust">
              <span className="portal-trust-icon" aria-hidden="true">✓</span>
              <div><strong>Private by design</strong><span>Original screenshots stay on your phone.</span></div>
            </div>
          </div>
        </aside>

        <section className="portal-auth-card portal-auth-card-compact" aria-labelledby="login-title">
          <div className="portal-auth-card-inner">
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
                  <input
                    id="samhaal-auth-password"
                    type="password"
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

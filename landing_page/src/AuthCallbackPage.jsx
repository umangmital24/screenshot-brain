import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function AuthCallbackPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function finishSignIn() {
      // Supabase parses implicit-flow tokens from the URL automatically,
      // then persists the session before getSession() resolves.
      const search = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.slice(1))
      const authError = search.get('error_description') || hash.get('error_description')
        || search.get('error') || hash.get('error')

      if (authError) {
        if (active) setError(authError)
        return
      }

      try {
        // Backwards-compatible with any pending links created under the
        // previous PKCE configuration (when the browser has the verifier).
        const code = search.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        }
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!data.session) {
          throw new Error('No login session was found. Request a new email link and open it in the same browser.')
        }
        if (active) window.location.replace('/dashboard')
      } catch (err) {
        if (active) setError(err?.message || 'Could not finish sign-in.')
      }
    }
    finishSignIn()
    return () => { active = false }
  }, [])

  return (
    <main className="portal-shell">
      <header className="portal-topbar"><a className="portal-brand portal-brand-with-logo" href="/"><img className="portal-brand-logo" src="/samhaal-logo.svg" alt="" /> <span>Samhaal <span>संभाल</span></span></a></header>
      <section className="portal-auth-card" aria-live="polite">
        <p className="portal-eyebrow">ACCOUNT AUTHENTICATION</p>
        <h1>{error ? 'Sign-in failed.' : 'Signing you in…'}</h1>
        <p className={error ? 'portal-error' : 'portal-muted'}>{error || 'Completing your secure Samhaal login.'}</p>
        {error && <a className="portal-button portal-primary portal-button-link" href="/login">Back to login</a>}
      </section>
    </main>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function AuthCallbackPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function finishSignIn() {
      if (!supabase) {
        setError('Web login has not been configured.')
        return
      }
      const params = new URLSearchParams(window.location.search)
      const providerError = params.get('error_description') || params.get('error')
      if (providerError) {
        setError(providerError)
        return
      }
      const code = params.get('code')
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        }
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (!data.session) throw new Error('No active session. Please sign in again.')
        window.location.replace('/dashboard')
      } catch (err) {
        if (mounted) setError(err?.message || 'Could not finish sign-in.')
      }
    }
    finishSignIn()
    return () => { mounted = false }
  }, [])

  return (
    <main className="portal-shell">
      <header className="portal-topbar"><a className="portal-brand" href="/">Samhaal <span>संभाल</span></a></header>
      <section className="portal-auth-card" aria-live="polite">
        <p className="portal-eyebrow">ACCOUNT AUTHENTICATION</p>
        <h1>{error ? 'Sign-in failed.' : 'Signing you in…'}</h1>
        <p className={error ? 'portal-error' : 'portal-muted'}>{error || 'Completing your secure Samhaal login.'}</p>
        {error && <a className="portal-button portal-primary portal-button-link" href="/login">Back to login</a>}
      </section>
    </main>
  )
}

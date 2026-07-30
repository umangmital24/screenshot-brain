import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function LibraryCardLogin() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({ provider: 'google' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage({
          text: 'Account created. Check your email to confirm before signing in.',
          error: false,
        })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // successful sign-in triggers onAuthStateChange in the parent - no action needed here
      }
    } catch (err) {
      setMessage({ text: err.message || 'Something went wrong.', error: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card-eyebrow">Library Membership</div>
        <h1 className="login-card-title">The Catalog</h1>
        <p className="login-card-copy">
          {mode === 'signup'
            ? 'Create an account to start filing what you don\'t want to forget.'
            : "Sign in to open your drawer — everything you've meant to read, buy, cook, or visit, filed and waiting."}
        </p>

        <button className="google-signin-button" onClick={signInWithGoogle}>
          Continue with Google
        </button>

        <div className="login-divider">or</div>

        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <button type="submit" className="email-auth-button" disabled={submitting}>
            {submitting ? '…' : mode === 'signup' ? 'Create Account' : 'Log In'}
          </button>
        </form>

        {message && (
          <div className={`login-message ${message.error ? 'error' : ''}`}>{message.text}</div>
        )}

        <button
          className="login-mode-toggle"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
            setMessage(null)
          }}
        >
          {mode === 'signin' ? "New here? Create an account" : 'Already a member? Log in'}
        </button>
      </div>
    </div>
  )
}

const INTENT_META = {
  READ_LATER: { label: 'To Read', code: 'RD' },
  WATCH_LATER: { label: 'To Watch', code: 'WT' },
  BUY_LATER: { label: 'To Buy', code: 'BY' },
  COOK_LATER: { label: 'To Cook', code: 'CK' },
  VISIT_LATER: { label: 'To Visit', code: 'VS' },
  LEARN_LATER: { label: 'To Learn', code: 'LN' },
  APPLY_LATER: { label: 'To Apply', code: 'AP' },
  TRY_LATER: { label: 'To Try', code: 'TR' },
}

function intentLabel(intent) {
  return INTENT_META[intent]?.label ?? intent
}

function intentCode(intent) {
  return INTENT_META[intent]?.code ?? intent.slice(0, 2)
}

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function MemoryCard({ memory }) {
  return (
    <div className="memory-card">
      <div className="stamp">{intentCode(memory.intent)}</div>
      <div className="item-name">{memory.item_name}</div>
      <div className="category">{memory.category || 'Uncategorized'}</div>
      {memory.summary && <div className="summary">{memory.summary}</div>}
      <div className="card-footer">
        <span>filed {timeAgo(memory.last_seen)}</span>
        <span className="tally">×{memory.frequency}</span>
      </div>
    </div>
  )
}

function ReferenceDesk() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [log, setLog] = useState([])
  const [asking, setAsking] = useState(false)
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  async function ask(e) {
    e.preventDefault()
    if (!question.trim() || asking) return
    const q = question.trim()
    setQuestion('')
    setAsking(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      setLog((prev) => [...prev, { q, a: res.ok ? data.answer : 'The desk could not find an answer.' }])
    } catch {
      setLog((prev) => [...prev, { q, a: 'The desk is unreachable right now.' }])
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="reference-desk">
      <div className="reference-desk-inner">
        <button className="reference-desk-tab" onClick={() => setOpen((v) => !v)}>
          <span>Reference Desk — ask about your catalog</span>
          <span>{open ? '−' : '+'}</span>
        </button>
        {open && (
          <div className="reference-desk-body">
            {log.length > 0 && (
              <div className="reference-desk-log" ref={logRef}>
                {log.map((entry, i) => (
                  <div className="desk-entry" key={i}>
                    <div className="q">{entry.q}</div>
                    <div className="a">{entry.a}</div>
                  </div>
                ))}
              </div>
            )}
            <form className="reference-desk-form" onSubmit={ask}>
              <input
                type="text"
                placeholder="What books have I saved?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <button type="submit" disabled={asking}>
                {asking ? '…' : 'Ask'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [memories, setMemories] = useState([])
  const [summary, setSummary] = useState({})
  const [activeIntent, setActiveIntent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function authHeader() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function loadMemories(intent) {
    setLoading(true)
    try {
      const headers = await authHeader()
      const url = intent ? `${API_BASE}/memories?intent=${intent}` : `${API_BASE}/memories`
      const res = await fetch(url, { headers })
      const data = await res.json()
      setMemories(data.memories || [])
    } catch {
      setStatus({ text: 'Could not reach the catalog server.', error: true })
    } finally {
      setLoading(false)
    }
  }

  async function loadSummary() {
    try {
      const headers = await authHeader()
      const res = await fetch(`${API_BASE}/memories/summary`, { headers })
      const data = await res.json()
      setSummary(data.summary || {})
    } catch {
      // silent - summary chips just won't show counts
    }
  }

  useEffect(() => {
    if (!session) return
    loadSummary()
    loadMemories(null)
  }, [session])

  function selectIntent(intent) {
    setActiveIntent(intent)
    loadMemories(intent)
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setStatus({ text: `Filing "${file.name}"…`, error: false })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const headers = await authHeader()
      const res = await fetch(`${API_BASE}/screenshot`, { method: 'POST', body: formData, headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setStatus({
        text: `Filed under "${intentLabel(data.intent)}" — ${data.memories.length} item(s) catalogued.`,
        error: false,
      })
      await loadSummary()
      await loadMemories(activeIntent)
    } catch (err) {
      setStatus({ text: `Could not file that screenshot: ${err.message}`, error: true })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const totalCount = Object.values(summary).reduce((a, b) => a + b, 0)

  if (session === undefined) {
    return <div className="empty-state" style={{ margin: '80px auto', maxWidth: 400 }}>Checking your membership…</div>
  }

  if (!session) {
    return <LibraryCardLogin />
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1 className="app-title">The Catalog</h1>
          <p className="app-subtitle">
            Everything you meant to read, buy, cook, or visit — filed the moment you screenshotted it,
            instead of forgotten in your gallery.
          </p>
          <button className="signout-link" onClick={() => supabase.auth.signOut()}>
            Sign out ({session.user.email})
          </button>
        </div>
        <button className="accession-button" disabled={uploading}>
          {uploading ? 'Filing…' : '+ New Accession'}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
        </button>
      </header>

      {status && <div className={`status-line ${status.error ? 'error' : ''}`}>{status.text}</div>}

      <div className="drawer-labels">
        <button
          className={`drawer-label ${activeIntent === null ? 'active' : ''}`}
          onClick={() => selectIntent(null)}
        >
          All <span className="count">{totalCount}</span>
        </button>
        {Object.keys(INTENT_META).map((intent) => (
          <button
            key={intent}
            className={`drawer-label ${activeIntent === intent ? 'active' : ''}`}
            onClick={() => selectIntent(intent)}
          >
            {intentLabel(intent)} <span className="count">{summary[intent] || 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">Pulling cards from the drawer…</div>
      ) : memories.length === 0 ? (
        <div className="empty-state">
          Nothing filed here yet. Take a screenshot of something you don't want to forget, then use
          "New Accession" to add it to the catalog.
        </div>
      ) : (
        <div className="card-grid">
          {memories.map((m) => (
            <MemoryCard key={m.id} memory={m} />
          ))}
        </div>
      )}

      <ReferenceDesk />
    </div>
  )
}

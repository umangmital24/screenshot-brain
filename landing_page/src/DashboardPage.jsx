import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const API_BASE = (import.meta.env.VITE_API_BASE || 'https://screenshot-brain-1.onrender.com').replace(/\/$/, '')
const PAGE_SIZE = 40
const INTENTS = [
  ['READ_LATER', 'Read later'], ['WATCH_LATER', 'Watch later'],
  ['BUY_LATER', 'Buy later'], ['COOK_LATER', 'Cook later'],
  ['VISIT_LATER', 'Visit later'], ['LEARN_LATER', 'Learn later'],
  ['APPLY_LATER', 'Apply later'], ['TRY_LATER', 'Try later'],
]

async function api(path, options = {}) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Your session has expired. Please log in again.')
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + data.session.access_token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Samhaal could not complete this request (' + response.status + ').')
  }
  return payload
}

export default function DashboardPage() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [memories, setMemories] = useState([])
  const [summary, setSummary] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [intent, setIntent] = useState('')
  const [completion, setCompletion] = useState('')
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [question, setQuestion] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [askError, setAskError] = useState('')
  const [answer, setAnswer] = useState(null)

  useEffect(() => {
    if (!supabase) { setChecking(false); return }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (!data.session) window.location.replace('/login')
      else { setSession(data.session); setChecking(false) }
    }).catch(() => { if (active) window.location.replace('/login') })
    const { data: listener } = supabase.auth.onAuthStateChange((event, current) => {
      if (!active) return
      if (event === 'SIGNED_OUT') window.location.replace('/login')
      else if (current) setSession(current)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) return
    let active = true
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (search) params.set('search', search)
    if (intent) params.set('intent', intent)
    if (completion) params.set('is_done', completion)
    setLoading(true)
    setError('')
    Promise.all([api('/memories?' + params.toString()), api('/memories/summary')])
      .then(([data, stats]) => {
        if (active) { setMemories(data.memories || []); setSummary(stats) }
      })
      .catch(err => { if (active) setError(err?.message || 'Unable to load memories.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session?.access_token, search, intent, completion, offset, refresh])

  async function toggleDone(memory) {
    if (pendingId) return
    setPendingId(memory.id)
    setError('')
    try {
      await api('/memories/' + encodeURIComponent(memory.id), {
        method: 'PATCH', body: JSON.stringify({ is_done: !memory.is_done }),
      })
      setRefresh(v => v + 1)
    } catch (err) { setError(err.message) }
    finally { setPendingId(null) }
  }

  async function ask(event) {
    event.preventDefault()
    if (!question.trim() || askBusy) return
    setAskBusy(true)
    setAskError('')
    setAnswer(null)
    try {
      const data = await api('/chat', {
        method: 'POST',
        body: JSON.stringify({ question: question.trim(), client_request_id: crypto.randomUUID(), history: [] }),
      })
      setAnswer(data)
    } catch (err) { setAskError(err?.message || 'Unable to search memories.') }
    finally { setAskBusy(false) }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    window.location.replace('/')
  }

  if (checking) return <main className="portal-shell"><p className="portal-loading">Opening your Samhaal memories…</p></main>
  if (!supabase) return <main className="portal-shell"><section className="portal-auth-card"><h1>Configuration needed</h1><p className="portal-error">Web login requires Supabase environment variables.</p><a href="/" className="portal-back-link">← Home</a></section></main>

  return (
    <main className="portal-shell portal-dashboard-shell">
      <header className="portal-topbar">
        <a className="portal-brand" href="/">Samhaal <span>संभाल</span></a>
        <div className="portal-header-actions">
          <span className="portal-account">{session?.user?.email || 'My account'}</span>
          <button type="button" className="portal-text-link portal-link-button" onClick={signOut}>Log out</button>
        </div>
      </header>

      <section className="portal-dashboard">
        <div className="portal-dashboard-heading">
          <div><p className="portal-eyebrow">YOUR SAMHAAL SPACE</p><h1>Your memories, in one place.</h1><p className="portal-muted">Anything saved on Android becomes searchable here once it has synced.</p></div>
          <a className="portal-button portal-button-link portal-outline" href="/get-app">Get Android App →</a>
        </div>
        <div className="portal-stats">
          <div><span>Saved memories</span><strong>{summary ? (summary.active_count || 0) + (summary.done_count || 0) : '—'}</strong></div>
          <div><span>Still to explore</span><strong>{summary?.active_count ?? '—'}</strong></div>
          <div><span>Completed</span><strong>{summary?.done_count ?? '—'}</strong></div>
        </div>

        <section className="portal-section" aria-label="Your memories">
          <div className="portal-section-title"><h2>Memory library</h2><span>Metadata only · No screenshot uploads</span></div>
          <form className="portal-search" onSubmit={e => { e.preventDefault(); setOffset(0); setSearch(searchInput.trim()) }}>
            <label className="portal-sr-only" htmlFor="memory-search">Search memories</label>
            <input id="memory-search" type="search" placeholder="Search books, places, products, ideas…" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            <button type="submit" className="portal-button portal-primary">Search</button>
          </form>
          <div className="portal-filters">
            <label>Intent <select value={intent} onChange={e => { setIntent(e.target.value); setOffset(0) }}><option value="">All types</option>{INTENTS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Status <select value={completion} onChange={e => { setCompletion(e.target.value); setOffset(0) }}><option value="">All</option><option value="false">Active</option><option value="true">Completed</option></select></label>
            <button type="button" className="portal-text-link portal-link-button" onClick={() => setRefresh(v => v + 1)}>Refresh ↻</button>
          </div>
          {error && <p className="portal-error" role="alert">{error}</p>}
          {loading && <p className="portal-muted" role="status">Loading memories…</p>}
          {!loading && !error && memories.length === 0 && <div className="portal-empty">No memories found. Save a screenshot in your Android app or change your filters.</div>}
          <div className="portal-memory-grid">
            {memories.map(memory => (
              <article className="portal-memory" key={memory.id}>
                <div className="portal-memory-meta"><span>{memory.intent?.replaceAll('_', ' ') || 'SAVED'}</span><span>{memory.is_done ? 'Completed' : 'Active'}</span></div>
                <h3>{memory.item_name || 'Untitled memory'}</h3>
                {memory.summary && <p>{memory.summary}</p>}
                <div className="portal-memory-footer">
                  <span>{memory.category || memory.item_type || 'Memory'}</span>
                  <button type="button" disabled={pendingId === memory.id} onClick={() => toggleDone(memory)}>{memory.is_done ? 'Mark active' : 'Mark complete'}</button>
                </div>
                {memory.extracted_text && (
                  <>
                    <button className="portal-memory-expand" type="button" onClick={() => setExpanded(expanded === memory.id ? null : memory.id)} aria-expanded={expanded === memory.id}>
                      {expanded === memory.id ? 'Hide extracted text ↑' : 'View extracted text ↓'}
                    </button>
                    {expanded === memory.id && <p className="portal-memory-text">{memory.extracted_text}</p>}
                  </>
                )}
              </article>
            ))}
          </div>
          <div className="portal-pagination">
            <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>← Previous</button>
            <span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
            <button type="button" disabled={memories.length < PAGE_SIZE || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>Next →</button>
          </div>
        </section>

        <section className="portal-section" aria-label="Ask Samhaal">
          <div className="portal-section-title"><h2>Ask Samhaal</h2><span>Find things you previously saved</span></div>
          <form className="portal-search" onSubmit={ask}>
            <label htmlFor="ask-question" className="portal-sr-only">Ask a question</label>
            <input id="ask-question" type="text" placeholder="What was that book I wanted to read?" maxLength={1000} value={question} onChange={e => setQuestion(e.target.value)} />
            <button className="portal-button portal-primary" type="submit" disabled={askBusy}>{askBusy ? 'Searching…' : 'Ask'}</button>
          </form>
          {askError && <p className="portal-error" role="alert">{askError}</p>}
          {answer && <div className="portal-answer"><p>{answer.answer}</p>{answer.sources?.length > 0 && <div className="portal-answer-sources"><strong>Saved memory sources</strong>{answer.sources.map(source => <span key={source.memory_id}>{source.item_name}</span>)}</div>}</div>}
        </section>
        <p className="portal-privacy-note">Raw screenshots remain on your Android device. This website displays only synced memory information.</p>
      </section>
    </main>
  )
}

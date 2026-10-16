import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import './dashboard-v2.css'

// Match the near-black / white design tokens and intent names of the Android app.
// Keep this dashboard metadata-only: image_url and screenshots are never rendered.
const API_BASE = (import.meta.env.VITE_API_BASE || 'https://screenshot-brain-1.onrender.com').replace(/\/$/, '')
const PAGE_SIZE = 24
const INTENTS = [
  { key: 'READ_LATER', label: 'Read', icon: 'book' },
  { key: 'WATCH_LATER', label: 'Watch', icon: 'play' },
  { key: 'BUY_LATER', label: 'Buy', icon: 'bag' },
  { key: 'COOK_LATER', label: 'Cook', icon: 'chef' },
  { key: 'VISIT_LATER', label: 'Visit', icon: 'pin' },
  { key: 'LEARN_LATER', label: 'Learn', icon: 'graduation' },
  { key: 'APPLY_LATER', label: 'Apply', icon: 'briefcase' },
  { key: 'TRY_LATER', label: 'Try', icon: 'sparkles' },
]
const SUGGESTIONS = [
  'What movies did I save to watch?',
  'Find the restaurants I wanted to visit',
  'What books are on my reading list?',
  'Show me things I wanted to buy',
]
const ICONS = {
  grid: 'M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h7v7h-7z',
  layers: 'M12 2 2 7l10 5 10-5-10-5Z|m2 12 10 5 10-5|m2 17 10 5 10-5',
  sparkles: 'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z|m19 17 .8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17Z',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M20 12a8 8 0 1 1-3.1-6.3|m8 12 2.5 2.5L20 7',
  clock: 'M12 6v6l4 2|M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z|m21 21-4.35-4.35',
  arrow: 'M5 12h14|m13 6 6 6-6 6',
  arrowUp: 'M12 19V5|m5 12 7-7 7 7',
  chevron: 'm9 18 6-6-6-6',
  chevronDown: 'm6 9 6 6 6-6',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20|M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z',
  play: 'm8 5 11 7-11 7V5Z',
  bag: 'M5 8h14l1 13H4L5 8Z|M9 9V6a3 3 0 0 1 6 0v3',
  chef: 'M6 13a4 4 0 0 1-.3-7.9 5 5 0 0 1 9.2 0A4 4 0 0 1 18 13v7H6v-7Z|M6 16h12',
  pin: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z|M12 10a2.5 2.5 0 1 0 0 .01Z',
  graduation: 'm2 10 10-6 10 6-10 6-10-6Z|M6 12v5c4 3 8 3 12 0v-5|M22 10v7',
  briefcase: 'M3 7h18v14H3V7Z|M8 7V4h8v3|M3 12c5 4 13 4 18 0',
  file: 'M6 2h9l5 5v15H6V2Z|M14 2v6h6|M9 13h8|M9 17h8',
  shield: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z|m9 12 2 2 4-4',
  smartphone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z|M11 18h2',
  refresh: 'M20 7v5h-5|M4 17v-5h5|M5 12a7 7 0 0 1 12-5l3 5|M19 12a7 7 0 0 1-12 5l-3-5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9',
  user: 'M20 21a8 8 0 0 0-16 0|M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  x: 'M18 6 6 18|M6 6l12 12',
  edit: 'M12 20h9|M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5Z',
  trash: 'M3 6h18|M8 6V4h8v2|M6 6l1 15h10l1-15|M10 10v7|M14 10v7',
  calendar: 'M3 5h18v16H3V5Z|M7 3v4|M17 3v4|M3 10h18',
  menu: 'M4 7h16|M4 12h16|M4 17h16',
  filter: 'M4 7h16|M7 12h10|M10 17h4',
  more: 'M5 12h.01|M12 12h.01|M19 12h.01',
}
function Icon({ name, size = 18, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" aria-hidden="true">
    {(ICONS[name] || ICONS.file).split('|').map((d, i) => <path d={d} key={i} />)}
  </svg>
}
function intentInfo(intent) {
  return INTENTS.find(i => i.key === intent) || { key: intent, label: 'Saved', icon: 'file' }
}
function relativeDate(value) {
  if (!value) return 'Saved'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Saved'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return String(minutes) + 'm ago'
  if (minutes < 1440) return String(Math.floor(minutes / 60)) + 'h ago'
  if (minutes < 10080) return String(Math.floor(minutes / 1440)) + 'd ago'
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function cleanText(value) {
  return String(value || '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/^#{1,4}\s*/gm, '').trim()
}
async function api(path, options = {}) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Your session expired. Please sign in again.')
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
    let message = typeof payload.detail === 'string' ? payload.detail : ''
    if (!message) message = response.status === 429 ? 'Please wait a moment and try again.' : 'Request failed (' + response.status + ').'
    throw new Error(message)
  }
  return payload
}

async function streamAskAnswer(payload, onEvent) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Your session expired. Please sign in again.')
  const response = await fetch(API_BASE + '/chat/stream', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  // A deployment may temporarily have the old backend but the new frontend.
  // Only a missing route can safely fall back; avoid double-counting real Ask calls.
  if (response.status === 404 || response.status === 405) {
    const legacy = await api('/chat', { method: 'POST', body: JSON.stringify(payload) })
    onEvent({ type: 'sources', sources: legacy.sources || [] })
    onEvent({ type: 'token', text: legacy.answer || '' })
    onEvent({ type: 'done' })
    return
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Unable to search memories (' + response.status + ').')
  }
  if (!response.body) throw new Error('The server did not return a readable stream.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  let streamError = ''
  const consumeFrame = frame => {
    const line = frame.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trimStart()).join('\n')
    if (!line) return
    const event = JSON.parse(line)
    if (event.type === 'error') streamError = event.message || 'The answer could not be completed.'
    if (event.type === 'done') completed = true
    onEvent(event)
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        consumeFrame(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }
      if (streamError) throw new Error(streamError)
    }
    buffer += decoder.decode().replace(/\r\n/g, '\n')
    if (buffer.trim()) consumeFrame(buffer)
    if (streamError) throw new Error(streamError)
    if (!completed) throw new Error('The connection ended before your answer finished. Please try again.')
  } finally {
    reader.releaseLock()
  }
}

function MemoryCard({ memory, onOpen, onToggle, busy }) {
  const meta = intentInfo(memory.intent)
  return <article className={'sv-memory-card' + (memory.is_done ? ' is-complete' : '')}>
    <div className="sv-memory-top">
      <span className={'sv-intent-icon sv-intent-' + meta.icon}><Icon name={meta.icon} size={19} /></span>
      <span className="sv-memory-time"><Icon name="clock" size={12} /> {relativeDate(memory.last_seen || memory.created_at)}</span>
    </div>
    <div className="sv-memory-type">{meta.label} later {memory.is_done && <span className="sv-done-dot">· Completed</span>}</div>
    <button className="sv-memory-title" type="button" onClick={() => onOpen(memory)}>{memory.item_name || 'Untitled memory'}</button>
    <p className="sv-memory-desc">{memory.summary || 'Open to explore this saved memory.'}</p>
    <div className="sv-memory-bottom">
      <span className="sv-category">{memory.category || memory.item_type || 'Memory'}</span>
      <div className="sv-card-actions">
        <button className="sv-icon-action" title={memory.is_done ? 'Mark active' : 'Mark complete'} aria-label={memory.is_done ? 'Mark active' : 'Mark complete'} type="button" disabled={busy} onClick={() => onToggle(memory)}><Icon name={memory.is_done ? 'refresh' : 'check'} size={16} /></button>
        <button className="sv-card-view" type="button" onClick={() => onOpen(memory)} aria-label={'View ' + (memory.item_name || 'memory')}><Icon name="arrow" size={17} /></button>
      </div>
    </div>
  </article>
}
const initialView = () => {
  const view = new URLSearchParams(window.location.search).get('view')
  return ['home', 'memories', 'ask', 'completed'].includes(view) ? view : 'home'
}
export default function DashboardPage() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [view, setView] = useState(initialView)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [intent, setIntent] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [reload, setReload] = useState(0)
  const [memories, setMemories] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [selected, setSelected] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState({})
  const [detailError, setDetailError] = useState('')
  const [askInput, setAskInput] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const [chatLog, setChatLog] = useState([])
  const searchRef = useRef(null)
  const chatBottom = useRef(null)
  const detailClose = useRef(null)
  const profileMenuRef = useRef(null)
  const profileButtonRef = useRef(null)
  const profileLogoutRef = useRef(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (!data.session) window.location.replace('/login')
      else setSession(data.session)
      setChecking(false)
    }).catch(() => { if (mounted) window.location.replace('/login') })
    const { data: listener } = supabase.auth.onAuthStateChange((event, current) => {
      if (!mounted) return
      if (event === 'SIGNED_OUT') window.location.replace('/login')
      else if (current) setSession(current)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  const effectiveStatus = view === 'completed' ? 'true' : statusFilter
  const applyView = (next) => {
    setProfileOpen(false)
    setView(next)
    setSidebarOpen(false)
    setOffset(0)
    if (next === 'home') { setSearch(''); setSearchInput(''); setIntent(''); setStatusFilter('') }
    const u = new URL(window.location.href)
    if (next === 'home') u.searchParams.delete('view')
    else u.searchParams.set('view', next)
    window.history.replaceState({}, '', u.pathname + u.search)
  }
  useEffect(() => {
    const onPopState = () => setView(initialView())
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setView('memories')
        setSidebarOpen(false)
        // Wait until the Memory Library has mounted the search input.
        window.setTimeout(() => searchRef.current?.focus(), 0)
      }
      if (event.key === 'Escape') {
        setSelected(null)
        setSidebarOpen(false)
      }
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!profileOpen) return
    const handleOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false)
      }
    }
    const handleMenuKeys = (event) => {
      if (event.key === 'Escape') {
        setProfileOpen(false)
        profileButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    document.addEventListener('keydown', handleMenuKeys)
    profileLogoutRef.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick)
      document.removeEventListener('keydown', handleMenuKeys)
    }
  }, [profileOpen])

  useEffect(() => {
    if (!session) return
    let active = true
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) })
    if (search) params.set('search', search)
    if (intent) params.set('intent', intent)
    if (effectiveStatus) params.set('is_done', effectiveStatus)
    setLoading(true)
    setError('')
    Promise.all([
      api('/memories?' + params.toString()),
      api('/memories/summary'),
    ]).then(([result, counts]) => {
      if (!active) return
      setMemories(result.memories || [])
      setSummary(counts)
    }).catch(err => { if (active) setError(err.message || 'Unable to load memories.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session?.access_token, search, intent, effectiveStatus, offset, reload])

  useEffect(() => {
    if (chatLog.length) chatBottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatLog, askBusy])

  useEffect(() => {
    if (!selected) return
    detailClose.current?.focus()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = oldOverflow }
  }, [selected?.id])

  const chooseIntent = (key) => {
    setIntent(key)
    setOffset(0)
    if (view !== 'memories') applyView('memories')
  }
  const submitSearch = (e) => {
    e?.preventDefault()
    setSearch(searchInput.trim())
    setOffset(0)
    if (view !== 'memories') applyView('memories')
  }
  const openMemory = (memory) => {
    setSelected(memory)
    setDetailError('')
    setEditMode(false)
    setEditDraft({ item_name: memory.item_name || '', summary: memory.summary || '', category: memory.category || '' })
  }
  const refresh = () => setReload(v => v + 1)

  async function toggleDone(memory) {
    if (busyId) return
    setBusyId(memory.id)
    setError('')
    setDetailError('')
    try {
      const updated = await api('/memories/' + encodeURIComponent(memory.id), { method: 'PATCH', body: JSON.stringify({ is_done: !memory.is_done }) })
      if (selected?.id === memory.id) setSelected({ ...selected, ...updated.memory })
      refresh()
    } catch (err) {
      if (selected?.id === memory.id) setDetailError(err.message)
      else setError(err.message)
    } finally { setBusyId('') }
  }
  async function saveEdit(e) {
    e.preventDefault()
    if (!selected || busyId) return
    if (!editDraft.item_name?.trim()) { setDetailError('Give your memory a title.'); return }
    setBusyId(selected.id)
    setDetailError('')
    try {
      const updated = await api('/memories/' + encodeURIComponent(selected.id), {
        method: 'PATCH',
        body: JSON.stringify({
          item_name: editDraft.item_name.trim(),
          category: editDraft.category.trim(),
          summary: editDraft.summary.trim(),
        }),
      })
      setSelected({ ...selected, ...updated.memory })
      setEditMode(false)
      refresh()
    } catch (err) { setDetailError(err.message) }
    finally { setBusyId('') }
  }
  async function deleteMemory() {
    if (!selected || busyId) return
    if (!window.confirm('Delete this memory? This action cannot be undone.')) return
    setBusyId(selected.id)
    setDetailError('')
    try {
      await api('/memories/' + encodeURIComponent(selected.id), { method: 'DELETE' })
      setSelected(null)
      refresh()
    } catch (err) { setDetailError(err.message) }
    finally { setBusyId('') }
  }
  async function ask(e, text) {
    e?.preventDefault()
    const question = String(text || askInput).trim()
    if (!question || askBusy) return
    const history = chatLog
      .filter(x => !x.error && !x.pending)
      .flatMap(x => [{ role: 'user', text: x.question }, ...(x.answer ? [{ role: 'assistant', text: x.answer }] : [])])
      .slice(-10)
      .map(x => ({ role: x.role, text: x.text.slice(0, 1500) }))
    const id = crypto.randomUUID()
    setAskBusy(true)
    setAskInput('')
    setChatLog(prev => [...prev, { id, question, answer: '', sources: [], status: 'Searching your saved memories…', pending: true }])
    const update = fn => setChatLog(prev => prev.map(item => item.id === id ? fn(item) : item))
    try {
      await streamAskAnswer({ question, history, client_request_id: id }, event => {
        if (event.type === 'status') {
          update(item => ({ ...item, status: event.text || 'Thinking…' }))
        } else if (event.type === 'sources') {
          update(item => ({ ...item, sources: event.sources || [] }))
        } else if (event.type === 'token') {
          update(item => ({ ...item, answer: item.answer + (event.text || ''), status: '' }))
        } else if (event.type === 'done') {
          update(item => ({ ...item, pending: false, status: '', answer: cleanText(item.answer) }))
        }
      })
    } catch (err) {
      update(item => ({ ...item, error: true, pending: false, status: '',
        answer: item.answer
          ? item.answer + '\n\n' + (err.message || 'Stream interrupted.')
          : (err.message || 'Could not reach your memories. Try again.'),
      }))
    } finally {
      setAskBusy(false)
    }
  }
  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setLogoutError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      window.location.replace('/login')
    } catch (err) {
      setLogoutError(err?.message || 'Could not log out. Please try again.')
      setProfileOpen(true)
      setSigningOut(false)
    }
  }

  if (checking) return <main className="portal-shell"><p className="portal-loading">Opening your Samhaal memories…</p></main>

  const activeCount = summary?.active_count ?? 0
  const doneCount = summary?.done_count ?? 0
  const total = summary ? activeCount + doneCount : null
  const countsByIntent = summary?.by_intent || {}
  const activeNav = [
    { key: 'home', label: 'Overview', icon: 'grid' },
    { key: 'memories', label: 'All memories', icon: 'layers' },
    { key: 'ask', label: 'Ask Samhaal', icon: 'sparkles' },
    { key: 'completed', label: 'Completed', icon: 'checkCircle' },
  ]
  const empty = !loading && !error && memories.length === 0
  const memoryList = (items) => <div className="sv-memory-grid">
    {items.map(memory => <MemoryCard key={memory.id} memory={memory} onOpen={openMemory} onToggle={toggleDone} busy={busyId === memory.id} />)}
  </div>

  return <div className="portal-shell sv-app">
    {sidebarOpen && <button className="sv-mobile-scrim" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={'sv-sidebar' + (sidebarOpen ? ' sv-sidebar-open' : '')} aria-label="Dashboard navigation">
      <a className="sv-brand" href="/" title="Samhaal homepage">
        <img src="/samhaal-logo.svg" alt="" className="sv-brand-logo" />
        <span className="sv-brand-word">Samhaal<span className="sv-brand-native">संभाल</span></span>
      </a>
      <div className="sv-side-label">WORKSPACE</div>
      <nav className="sv-nav">
        {activeNav.map(nav => <button key={nav.key} className={'sv-nav-item' + (view === nav.key ? ' sv-nav-active' : '')} type="button" aria-current={view === nav.key ? 'page' : undefined} onClick={() => applyView(nav.key)}>
          <Icon name={nav.icon} size={18} /><span>{nav.label}</span>{nav.key === 'completed' && doneCount > 0 && <span className="sv-nav-count">{doneCount}</span>}
        </button>)}
      </nav>
      <div className="sv-side-label sv-side-categories">YOUR COLLECTIONS</div>
      <nav className="sv-nav sv-nav-categories" aria-label="Memory intent categories">
        {INTENTS.map(meta => <button className={'sv-nav-item sv-nav-sub' + (view === 'memories' && intent === meta.key ? ' sv-nav-active' : '')} type="button" key={meta.key} onClick={() => chooseIntent(meta.key)}>
          <Icon name={meta.icon} size={17} /><span>{meta.label} later</span>{countsByIntent[meta.key] > 0 && <span className="sv-nav-count">{countsByIntent[meta.key]}</span>}
        </button>)}
      </nav>
      <div className="sv-sidebar-foot">
        <div className="sv-private-note"><Icon name="shield" size={16} /><div><strong>Private by design</strong><span>Original screenshots stay on your phone.</span></div></div>
        <a className="sv-download" href="/get-app"><Icon name="smartphone" size={17} /> Get the Android app <Icon name="arrow" size={15} /></a>
        <button className="sv-account-line" type="button" onClick={signOut} disabled={signingOut} title="Log out of Samhaal">
          <span className="sv-avatar">{(session?.user?.email || 'S').slice(0, 1).toUpperCase()}</span>
          <span className="sv-account-info"><strong>{signingOut ? 'Logging out…' : 'Log out'}</strong><small>{session?.user?.email || 'Signed in'}</small></span>
          <Icon name="logout" size={17} />
        </button>
      </div>
    </aside>

    <div className="sv-workspace">
      <header className="sv-topbar">
        <div className="sv-top-left">
          <button className="sv-mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Icon name="menu" size={21}/></button>
          <span className="sv-breadcrumb">My workspace</span><Icon name="chevron" size={13} /><strong>{view === 'home' ? 'Overview' : view === 'memories' ? 'Memory library' : view === 'ask' ? 'Ask Samhaal' : 'Completed'}</strong>
        </div>
        <div className="sv-top-actions">
          <button
            className="sv-top-search"
            type="button"
            title="Search memories (Ctrl/⌘ + K)"
            aria-label="Open memory search"
            onClick={() => { applyView('memories'); window.setTimeout(() => searchRef.current?.focus(), 0) }}
          ><Icon name="search" size={20} /></button>
          <button
            className={'sv-top-refresh' + (loading ? ' is-refreshing' : '')}
            type="button"
            title="Refresh saved memories from the cloud"
            aria-label="Refresh saved memories"
            onClick={refresh}
            disabled={loading}
          ><Icon name="refresh" size={18} /></button>
          <div className="sv-profile-wrap" ref={profileMenuRef}>
            <button
              className="sv-profile-trigger"
              ref={profileButtonRef}
              type="button"
              aria-label="Open account menu"
              aria-expanded={profileOpen}
              aria-controls="sv-account-menu"
              title="Account and log out"
              onClick={() => { setProfileOpen(open => !open); setLogoutError('') }}
            >
              <span className="sv-avatar sv-top-avatar">{(session?.user?.email || 'S').slice(0, 1).toUpperCase()}</span>
            </button>
            {profileOpen && (
              <div className="sv-profile-menu" id="sv-account-menu" aria-label="Account options">
                <div className="sv-profile-heading">
                  <span className="sv-avatar">{(session?.user?.email || 'S').slice(0, 1).toUpperCase()}</span>
                  <div className="sv-profile-identity">
                    <strong>Samhaal account</strong>
                    <small>{session?.user?.email || 'Signed in'}</small>
                  </div>
                </div>
                <button
                  className="sv-profile-logout"
                  ref={profileLogoutRef}
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                ><Icon name="logout" size={17} /> {signingOut ? 'Logging out…' : 'Log out'}</button>
                {logoutError && <p className="sv-profile-error" role="alert">{logoutError}</p>}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={'sv-page' + (view === 'ask' ? ' sv-page-chat' : '')}>
        {view === 'home' && <>
          <div className="sv-intro"><span className="sv-overline"><span className="sv-online-dot"/> YOUR PERSONAL MEMORY SPACE</span><h1>Remember it<span className="sv-period">.</span></h1><p>Everything worth saving, finally easy to find. Your Android memories live here too.</p></div>
          <section className="sv-hero">
            <div className="sv-hero-copy"><span className="sv-hero-tag"><Icon name="sparkles" size={13} /> YOUR SECOND BRAIN</span><h2>Saved once.<br/>Found whenever.</h2><p>Ask Samhaal about a book, movie, place or idea you saved. No scrolling through endless screenshots.</p>
              <div className="sv-hero-actions"><button className="sv-btn sv-btn-light" type="button" onClick={() => applyView('ask')}>Ask your memory <Icon name="arrow" size={17} /></button><button className="sv-hero-secondary" type="button" onClick={() => applyView('memories')}>Explore library <Icon name="arrow" size={15} /></button></div>
            </div>
            <div className="sv-hero-decoration" aria-hidden="true"><div className="sv-deco-ring sv-deco-ring-one"/><div className="sv-deco-ring sv-deco-ring-two"/><div className="sv-deco-ring sv-deco-ring-three"/><span>✦</span></div>
          </section>
          <div className="sv-stats">
            <div className="sv-stat"><div className="sv-stat-top"><span>Total memories</span><span className="sv-stat-icon"><Icon name="layers" size={18}/></span></div><strong>{total ?? '—'}</strong><small>Safe in your Samhaal space</small></div>
            <div className="sv-stat"><div className="sv-stat-top"><span>To explore</span><span className="sv-stat-icon"><Icon name="clock" size={18}/></span></div><strong>{summary ? activeCount : '—'}</strong><small>Still on your list</small></div>
            <div className="sv-stat"><div className="sv-stat-top"><span>Completed</span><span className="sv-stat-icon"><Icon name="checkCircle" size={18}/></span></div><strong>{summary ? doneCount : '—'}</strong><small>Memories revisited</small></div>
          </div>
          <div className="sv-section-heading"><div><span className="sv-overline">PICK UP WHERE YOU LEFT OFF</span><h2>Recently saved</h2></div><button className="sv-inline-link" type="button" onClick={() => applyView('memories')}>View all memories <Icon name="arrow" size={16}/></button></div>
          {error && <div className="sv-error" role="alert">{error}<button type="button" onClick={refresh}>Retry</button></div>}
          {loading ? <div className="sv-loading-grid"><div/><div/><div/></div> : empty ? <div className="sv-empty"><Icon name="layers" size={27}/><h3>Your memories will appear here</h3><p>Save your first screenshot in the Android app, then refresh.</p><a href="/get-app">Get Samhaal for Android <Icon name="arrow" size={15}/></a></div> : memoryList(memories.slice(0, 6))}
          <div className="sv-privacy-banner"><span className="sv-shield-spot"><Icon name="shield" size={20}/></span><div><strong>What stays on your phone, stays on your phone.</strong><p>Only extracted text and memory details sync to Samhaal Web. No raw screenshot backup.</p></div><span className="sv-banner-label">PRIVACY FIRST</span></div>
        </>}

        {(view === 'memories' || view === 'completed') && <>
          <div className="sv-page-heading"><div><span className="sv-overline">{view === 'completed' ? 'YOUR PROGRESS' : 'EVERYTHING YOU SAVED'}</span><h1>{view === 'completed' ? 'Completed memories' : 'Memory library'}<span className="sv-period">.</span></h1><p>{view === 'completed' ? 'All the things you have come back to, in one place.' : 'Find what matters across everything you saved on Android.'}</p></div><div className="sv-heading-actions"><button className="sv-btn sv-btn-outline" type="button" onClick={refresh}><Icon name="refresh" size={16}/> Refresh</button></div></div>
          <form className="sv-search-form" onSubmit={submitSearch}>
            <Icon name="search" size={20}/><label className="portal-sr-only" htmlFor="sv-search">Search your memories</label>
            <input id="sv-search" ref={searchRef} type="search" placeholder="Search a title, place, idea, or anything you remember…" value={searchInput} onChange={e => setSearchInput(e.target.value)}/>
            <button className="sv-search-submit" type="submit">Search <Icon name="arrow" size={16}/></button>
          </form>
          <div className="sv-filter-bar">
            <div className="sv-filter-pills" role="group" aria-label="Filter by memory type">
              <button type="button" className={'sv-filter-pill' + (!intent ? ' active' : '')} onClick={() => chooseIntent('')}>All memories</button>
              {INTENTS.map(meta => <button type="button" key={meta.key} className={'sv-filter-pill' + (intent === meta.key ? ' active' : '')} onClick={() => chooseIntent(meta.key)}><Icon name={meta.icon} size={14}/>{meta.label}</button>)}
            </div>
            {view !== 'completed' && <label className="sv-status-select"><Icon name="filter" size={15}/><span className="portal-sr-only">Filter by status</span><select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setOffset(0) }}><option value="">Any status</option><option value="false">To explore</option><option value="true">Completed</option></select><Icon name="chevronDown" size={14}/></label>}
          </div>
          <div className="sv-library-meta"><span>{loading ? 'Loading your memories…' : memories.length ? 'Showing ' + (offset + 1) + '–' + (offset + memories.length) + ' memories' : 'No matching memories'}</span>{(search || intent || statusFilter) && <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setIntent(''); setStatusFilter(''); setOffset(0) }}>Clear filters <Icon name="x" size={13}/></button>}</div>
          {error && <div className="sv-error" role="alert">{error}<button type="button" onClick={refresh}>Retry</button></div>}
          {loading ? <div className="sv-loading-grid"><div/><div/><div/></div> : empty ? <div className="sv-empty"><Icon name="search" size={28}/><h3>Nothing here yet</h3><p>Try another search or category. Memories saved on Android appear after syncing.</p></div> : memoryList(memories)}
          <div className="sv-page-controls"><button type="button" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><Icon name="chevron" className="sv-flip" size={15}/> Previous</button><span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span><button type="button" disabled={loading || memories.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>Next <Icon name="chevron" size={15}/></button></div>
        </>}

        {view === 'ask' && <section className="sv-chat-layout">
          <div className="sv-chat-heading"><span className="sv-overline">ASK SAMHAAL</span><h1>Ask your memory<span className="sv-period">.</span></h1><p>Search naturally. Samhaal answers from the things you actually saved.</p></div>
          <div className="sv-chat-panel">
            <div className="sv-chat-thread">
              {!chatLog.length && <div className="sv-chat-welcome"><div className="sv-ask-symbol"><Icon name="sparkles" size={26}/></div><h2>What are you looking for?</h2><p>No need to remember the exact filename, date or wording. Just ask.</p><div className="sv-ask-suggestions">{SUGGESTIONS.map(s => <button type="button" key={s} onClick={() => ask(null, s)} disabled={askBusy}><span>{s}</span><Icon name="arrow" size={16}/></button>)}</div></div>}
              {chatLog.map((msg, i) => <div className="sv-chat-turn" key={i}><div className="sv-chat-user"><span>{msg.question}</span></div><div className={'sv-chat-assistant' + (msg.error ? ' sv-chat-failed' : '')}><span className="sv-assistant-avatar"><img src="/samhaal-logo.svg" alt="Samhaal" className="sv-assistant-logo" /></span><div className="sv-chat-response">{msg.pending && !msg.answer ? <div className="sv-typing"><i/><i/><i/><span>{msg.status || 'Searching your memories…'}</span></div> : <p className={msg.pending ? 'sv-streaming-text' : undefined}>{msg.answer}{msg.pending && <span className="sv-stream-cursor" aria-hidden="true" />}</p>}
                {!msg.pending && msg.sources?.length > 0 && <div className="sv-answer-sources"><strong>From your memories <span>{msg.sources.length}</span></strong><div className="sv-source-grid">{msg.sources.map((source, n) => <button key={source.memory_id || n} type="button" className="sv-source-item" onClick={() => openMemory({ ...source, id: source.memory_id })}><span className="sv-source-icon"><Icon name={intentInfo(source.intent).icon} size={17}/></span><span className="sv-source-name"><b>{source.item_name || 'Saved memory'}</b><small>{source.category || intentInfo(source.intent).label + ' later'}</small></span><Icon name="arrow" size={15}/></button>)}</div></div>}
              </div></div></div>)}
              <div ref={chatBottom}/>
            </div>
            <div className="sv-chat-composer-area"><form onSubmit={ask} className="sv-chat-composer"><Icon name="sparkles" size={19}/><label className="portal-sr-only" htmlFor="sv-ask-input">Ask Samhaal</label><input id="sv-ask-input" type="text" maxLength={1000} value={askInput} onChange={e => setAskInput(e.target.value)} placeholder="Ask Samhaal anything you saved…" /><button type="submit" disabled={!askInput.trim() || askBusy} aria-label="Send question"><Icon name="arrowUp" size={19}/></button></form><p><Icon name="shield" size={12}/> Answers are grounded in your saved Samhaal memories.</p></div>
          </div>
        </section>}
      </div>
    </div>

    {selected && <div className="sv-detail-root" role="presentation">
      <button type="button" className="sv-detail-backdrop" onClick={() => setSelected(null)} aria-label="Close memory details"/>
      <section className="sv-detail-panel" role="dialog" aria-modal="true" aria-labelledby="sv-detail-heading">
        <div className="sv-detail-header"><div><span className="sv-overline">SAVED MEMORY</span><h2 id="sv-detail-heading">Memory details</h2></div><button ref={detailClose} type="button" onClick={() => setSelected(null)} aria-label="Close details" className="sv-close-btn"><Icon name="x" size={19}/></button></div>
        <div className="sv-detail-content">
          <span className="sv-detail-intent"><Icon name={intentInfo(selected.intent).icon} size={18}/>{intentInfo(selected.intent).label} later</span>
          {editMode ? <form className="sv-edit-form" onSubmit={saveEdit}>
            <label htmlFor="sv-edit-title">Title</label><input id="sv-edit-title" value={editDraft.item_name} maxLength={300} required onChange={e => setEditDraft(s => ({ ...s, item_name: e.target.value }))}/>
            <label htmlFor="sv-edit-category">Category</label><input id="sv-edit-category" value={editDraft.category} maxLength={120} onChange={e => setEditDraft(s => ({ ...s, category: e.target.value }))}/>
            <label htmlFor="sv-edit-summary">Summary</label><textarea id="sv-edit-summary" rows={5} value={editDraft.summary} maxLength={1000} onChange={e => setEditDraft(s => ({ ...s, summary: e.target.value }))}/>
            <div className="sv-edit-actions"><button className="sv-btn sv-btn-outline" type="button" onClick={() => setEditMode(false)}>Cancel</button><button className="sv-btn sv-btn-dark" disabled={!!busyId} type="submit">Save changes</button></div>
          </form> : <>
            <h3 className="sv-detail-title">{selected.item_name || 'Saved memory'}</h3>
            <p className="sv-detail-description">{selected.summary || 'No summary saved for this memory.'}</p>
            <div className="sv-detail-properties">
              <div><span>Category</span><strong>{selected.category || selected.item_type || 'Saved memory'}</strong></div>
              <div><span>Status</span><strong>{selected.is_done ? 'Completed' : 'To explore'}</strong></div>
              <div><span>Last saved</span><strong>{relativeDate(selected.last_seen || selected.created_at)}</strong></div>
              {selected.frequency > 1 && <div><span>Saved times</span><strong>{selected.frequency}</strong></div>}
            </div>
            {selected.visual_context && <div className="sv-detail-extract"><h4>Visual context</h4><p>{selected.visual_context}</p></div>}
            {selected.extracted_text && <div className="sv-detail-extract"><h4>Extracted text</h4><p>{selected.extracted_text}</p></div>}
            <div className="sv-detail-private"><Icon name="shield" size={17}/><p>Screenshot images remain on your Android device. Only saved memory text and metadata are shown here.</p></div>
          </>}
          {detailError && <div className="sv-error" role="alert">{detailError}</div>}
        </div>
        {!editMode && <div className="sv-detail-footer"><button className="sv-btn sv-btn-outline" disabled={!!busyId} type="button" onClick={() => { setEditMode(true); setDetailError('') }}><Icon name="edit" size={16}/> Edit</button><button className="sv-btn sv-btn-outline sv-delete" disabled={!!busyId} type="button" onClick={deleteMemory} title="Delete memory"><Icon name="trash" size={16}/></button><button className="sv-btn sv-btn-dark" disabled={!!busyId} type="button" onClick={() => toggleDone(selected)}><Icon name={selected.is_done ? 'refresh' : 'check'} size={17}/>{selected.is_done ? 'Mark active' : 'Mark complete'}</button></div>}
      </section>
    </div>}
    <nav className="sv-mobile-nav" aria-label="Quick navigation">{activeNav.map(nav => <button type="button" key={nav.key} onClick={() => applyView(nav.key)} className={view === nav.key ? 'selected' : ''}><Icon name={nav.icon} size={20}/><span>{nav.key === 'home' ? 'Home' : nav.key === 'memories' ? 'Memories' : nav.key === 'ask' ? 'Ask' : 'Done'}</span></button>)}</nav>
  </div>
}
import { useEffect, useRef, useState } from 'react'
import './memory-universe.css'

// Illustrative examples only. No personal or authenticated memory data is read here.
const EXAMPLE_MEMORIES = [
  { id: 'watch', intent: 'Watch later', icon: '▶', title: 'Interstellar', description: 'A movie you wanted to watch.' },
  { id: 'read', intent: 'Read later', icon: '▤', title: 'Atomic Habits', description: 'A book worth revisiting.' },
  { id: 'visit', intent: 'Visit later', icon: '⌖', title: 'Kyoto, Japan', description: 'A place on your travel list.' },
  { id: 'buy', intent: 'Buy later', icon: '◇', title: 'The perfect desk setup', description: 'A product idea saved for later.' },
  { id: 'idea', intent: 'Remember this', icon: '✦', title: 'A great idea', description: 'A thought worth keeping.' },
]

const MESSAGES = {
  idle: ['Every screenshot has a story.', 'Saved once. Found whenever.'],
  active: ['Let’s find your memories.', 'Your Samhaal space is ready.'],
  private: ['Private by design.', 'Your original screenshots stay on Android.'],
  peek: ['A tiny peek into your universe.', 'Your memories stay protected.'],
  sent: ['Check your inbox. ✦', 'Your Samhaal space is one click away.'],
  error: ['Let’s try that again.', 'Your memories are still waiting for you.'],
}

/**
 * Product-focused preview for the unauthenticated login screen.
 * Reacts only to focus, password visibility and login status.
 * Pointer movement is purely decorative and uses CSS variables without rerenders.
 */
export default function MemoryUniverse({
  attention,
  feedback,
  passwordVisible = false,
  compact = false,
}) {
  const sceneRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)

  const state = feedback === 'sent'
    ? 'sent'
    : feedback === 'error'
      ? 'error'
      : attention === 'password'
        ? (passwordVisible ? 'peek' : 'private')
        : attention === 'email'
          ? 'active'
          : 'idle'

  useEffect(() => {
    if (state === 'private' || state === 'peek' || state === 'sent') {
      setSelectedId(null)
    }
  }, [state])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const onPointerMove = (event) => {
      const bounds = scene.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)))
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)))
      scene.style.setProperty('--universe-x', `${Math.round(x * 10)}px`)
      scene.style.setProperty('--universe-y', `${Math.round(y * 8)}px`)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  const chosen = EXAMPLE_MEMORIES.find(item => item.id === selectedId)
  const [title, subtitle] = chosen && (state === 'idle' || state === 'active')
    ? [chosen.title, chosen.description]
    : MESSAGES[state]

  const selectMemory = (id) => setSelectedId(current => current === id ? null : id)

  return (
    <section
      ref={sceneRef}
      className={`memory-universe memory-universe--${state}${compact ? ' memory-universe--compact' : ''}`}
      aria-label="Interactive illustration of Samhaal's memory collections"
    >
      <div className="memory-universe-stage">
        <div className="memory-universe-speckles" aria-hidden="true" />
        <div className="memory-universe-orbit memory-universe-orbit--one" aria-hidden="true" />
        <div className="memory-universe-orbit memory-universe-orbit--two" aria-hidden="true" />
        <div className="memory-universe-orbit memory-universe-orbit--three" aria-hidden="true" />
        <div className="memory-universe-radial" aria-hidden="true" />

        {EXAMPLE_MEMORIES.map(item => (
          <div key={item.id} className={`memory-universe-slot memory-universe-slot--${item.id}`}>
            <button
              type="button"
              className={`memory-universe-chip${selectedId === item.id ? ' memory-universe-chip--selected' : ''}`}
              onClick={() => selectMemory(item.id)}
              aria-label={`Preview ${item.intent}: ${item.title}`}
              aria-pressed={selectedId === item.id}
              disabled={state === 'private' || state === 'peek' || state === 'sent'}
            >
              <span className="memory-universe-chip-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.intent}</span>
            </button>
          </div>
        ))}

        <div className="memory-universe-core" aria-hidden="true">
          <div className="memory-universe-core-glow" />
          <div className="memory-universe-core-shell">
            <img src="/samhaal-logo.svg" alt="" width="54" height="54" />
          </div>
          <span className="memory-universe-core-name">Samhaal</span>
        </div>

        <div className="memory-universe-vault" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10.5" width="14" height="10" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
        </div>

        <div className="memory-universe-peek" aria-hidden="true">
          <span>✦</span>
          <span>Still your memories</span>
        </div>

        <div className="memory-universe-success" aria-hidden="true">✓</div>
      </div>

      <div className="memory-universe-caption" aria-live={compact ? 'off' : 'polite'} aria-atomic="true">
        <strong>{title}</strong>
        <span>{subtitle}</span>
        {!chosen && state === 'idle' && <small>Explore the memories orbiting Samhaal ↗</small>}
        {chosen && <small>Illustrative preview, not your personal data</small>}
      </div>
    </section>
  )
}

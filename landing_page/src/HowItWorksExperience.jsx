import { useEffect, useRef, useState } from 'react'

/**
 * A tactile, four-step product demo using the original Samhaal screenshots.
 * This deliberately avoids recreating phone UI in CSS.
 */
const STEPS = [
  {
    id: 'choose',
    number: '01',
    label: 'Choose',
    title: 'Spot something worth keeping.',
    short: 'Keep only what matters.',
    eyebrow: 'THE MOMENT',
    heading: 'That looks worth remembering.',
    description: 'Save the useful screenshot instead of hoping you will find it in your gallery later.',
    image: '/story/04.webp',
    alt: 'Original Samhaal screenshot showing a café page with Save to Samhaal and Ignore options.',
    detailLabel: 'YOUR CALL',
    detailTitle: 'Selective by design',
    detail: 'Choose what becomes a memory. The rest can stay in your gallery.',
  },
  {
    id: 'save',
    number: '02',
    label: 'Save',
    title: 'One tap. Keep moving.',
    short: 'Save without the clutter.',
    eyebrow: 'ONE SMALL TAP',
    heading: 'Saved before you forget.',
    description: 'The Android save bubble gives you a quick way to keep a screen, without taking another gallery screenshot.',
    image: '/story/05.webp',
    alt: 'Original Samhaal screenshot demonstrating the one-tap save bubble and confirmation.',
    detailLabel: 'LESS FRICTION',
    detailTitle: 'A lighter way to save',
    detail: 'Tap the bubble, see the confirmation, and carry on with your day.',
  },
  {
    id: 'organize',
    number: '03',
    label: 'Organize',
    title: 'From clutter to context.',
    short: 'Meaning, not file names.',
    eyebrow: 'THE GOOD PART',
    heading: 'Your memories make sense.',
    description: 'Samhaal uses extracted information to organize the things you saved into memories you can browse and search.',
    image: '/story/03.webp',
    alt: 'Original Samhaal screenshots organized as cards for cafés, travel, cooking and code.',
    detailLabel: 'ALL TOGETHER',
    detailTitle: 'Things, not filenames',
    detail: 'Cafés, recipes, products, trips and ideas — ready when you need them.',
  },
  {
    id: 'ask',
    number: '04',
    label: 'Ask',
    title: 'Ask the thing you remember.',
    short: 'And find its source.',
    eyebrow: 'THE PAYOFF',
    heading: 'A month later. Found it.',
    description: 'Ask naturally. Samhaal helps you reconnect your question with the actual memory you saved.',
    image: '/story/07.webp',
    alt: 'Original Samhaal Ask screen finding The Brew Room from a natural-language question and showing its saved source.',
    detailLabel: 'FOUND IT',
    detailTitle: 'Answers with context',
    detail: 'Find the saved memory again, alongside the source it came from.',
  },
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function HowItWorksExperience() {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion)
  const buttonsRef = useRef([])
  const current = STEPS[active]

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => {
      setReduceMotion(query.matches)
      if (query.matches) setPlaying(false)
    }
    onChange()
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    if (!playing || reduceMotion) return undefined
    if (active === STEPS.length - 1) {
      setPlaying(false)
      return undefined
    }
    const timer = window.setTimeout(() => setActive((value) => Math.min(value + 1, STEPS.length - 1)), 3600)
    return () => window.clearTimeout(timer)
  }, [active, playing, reduceMotion])

  const selectStep = (index) => {
    setPlaying(false)
    setActive(index)
  }

  const handleStepKeyDown = (event, index) => {
    let next
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % STEPS.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + STEPS.length) % STEPS.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = STEPS.length - 1
    } else {
      return
    }
    event.preventDefault()
    selectStep(next)
    buttonsRef.current[next]?.focus()
  }

  const replay = () => {
    setActive(0)
    setPlaying(!reduceMotion)
  }

  return (
    <section id="how-it-works" className="samhaal-how" aria-labelledby="samhaal-how-heading">
      <div className="samhaal-how-container">
        <header className="samhaal-how-intro">
          <span className="samhaal-how-eyebrow"><span aria-hidden="true">✳</span> HOW IT WORKS · THE SHORT VERSION</span>
          <div className="samhaal-how-intro-grid">
            <h2 id="samhaal-how-heading">Save the moment.<br /><em>Find it later.</em></h2>
            <div className="samhaal-how-intro-aside">
              <p>Four small steps. A lot less time trying to remember where you saw that one thing.</p>
              <span>Pick a step below and watch the flow.</span>
            </div>
          </div>
        </header>

        <div className="samhaal-how-interface">
          <div className="samhaal-how-navigation" aria-label="Walkthrough steps">
            <div className="samhaal-how-nav-head">
              <span>THE JOURNEY</span>
              <span className="samhaal-how-fraction">{current.number} <span>/ 04</span></span>
            </div>

            <div className="samhaal-how-track" aria-hidden="true">
              <span style={{ width: ((active + 1) / STEPS.length * 100) + '%' }} />
            </div>

            <div className="samhaal-how-steps" role="tablist" aria-label="How Samhaal works">
              {STEPS.map((step, index) => (
                <button
                  key={step.id}
                  ref={(node) => { buttonsRef.current[index] = node }}
                  id={'samhaal-how-tab-' + step.id}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  aria-controls="samhaal-how-panel"
                  tabIndex={index === active ? 0 : -1}
                  onClick={() => selectStep(index)}
                  onKeyDown={(event) => handleStepKeyDown(event, index)}
                  className={'samhaal-how-tab' + (active === index ? ' is-active' : '')}
                >
                  <span className="samhaal-how-tab-index">{step.number}</span>
                  <span className="samhaal-how-tab-text">
                    <strong>{step.label}</strong>
                    <small>{step.short}</small>
                  </span>
                  <span className="samhaal-how-tab-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>

            <div className="samhaal-how-manual">
              <button
                type="button"
                onClick={replay}
                aria-label={reduceMotion ? 'Return to the first step' : 'Play the four-step walkthrough'}
                className="samhaal-how-play"
              >
                <span className="samhaal-how-play-icon" aria-hidden="true">{reduceMotion ? '↺' : '▶'}</span>
                {reduceMotion ? 'Start from step one' : playing ? 'Playing the flow…' : 'Play the full flow'}
              </button>
              <span className="samhaal-how-motion-hint">Or explore at your own pace.</span>
            </div>
          </div>

          <div
            className="samhaal-how-stage"
            id="samhaal-how-panel"
            role="tabpanel"
            aria-labelledby={'samhaal-how-tab-' + current.id}
            tabIndex={0}
          >
            <div className="samhaal-how-stage-top">
              <span><span className="samhaal-how-live-dot" aria-hidden="true" /> IN ACTION</span>
              <span>Samhaal / <strong>{current.label}</strong></span>
            </div>

            <div className="samhaal-how-stage-art">
              <div className="samhaal-how-orb samhaal-how-orb-one" aria-hidden="true" />
              <div className="samhaal-how-orb samhaal-how-orb-two" aria-hidden="true" />
              <div className="samhaal-how-image-wrap">
                <img
                  key={current.id}
                  className="samhaal-how-image"
                  src={current.image}
                  alt={current.alt}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="samhaal-how-art-marker" aria-hidden="true">संभाल<span>✳</span></div>
            </div>

            <div className="samhaal-how-caption" aria-live="polite" aria-atomic="true">
              <span className="samhaal-how-caption-index">{current.eyebrow}</span>
              <h3>{current.heading}</h3>
              <p>{current.description}</p>
            </div>

            <div className="samhaal-how-stage-foot">
              <span>REAL PRODUCT VISUALS</span>
              <div className="samhaal-how-dots" aria-label="Current step">
                {STEPS.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    className={'samhaal-how-dot' + (active === index ? ' is-active' : '')}
                    aria-label={'Show ' + step.label}
                    aria-current={active === index ? 'step' : undefined}
                    onClick={() => selectStep(index)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="samhaal-how-bottom">
          <div className="samhaal-how-bottom-copy">
            <span className="samhaal-how-bottom-mark" aria-hidden="true">↗</span>
            <span><strong>Built for real life.</strong> Screenshot, keep going, find it when it matters.</span>
          </div>
          <a href="#waitlist" className="samhaal-how-cta">Join early access <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>
  )
}

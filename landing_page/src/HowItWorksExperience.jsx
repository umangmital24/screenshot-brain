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
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion)
  const stepRefs = useRef([])
  const buttonsRef = useRef([])
  const frameRef = useRef(0)
  const current = STEPS[active]

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReduceMotion(media.matches)
    updateMotion()
    media.addEventListener?.('change', updateMotion)
    return () => media.removeEventListener?.('change', updateMotion)
  }, [])

  useEffect(() => {
    // The active chapter is the step closest to the reader's sightline.
    // On mobile the sticky visual occupies the upper half of the screen,
    // so the sightline moves down into the readable step text.
    const update = () => {
      frameRef.current = 0
      const mobile = window.matchMedia('(max-width: 760px)').matches
      const targetLine = innerHeight * (mobile ? .79 : .5)
      let closest = 0
      let best = Infinity
      stepRefs.current.forEach((node, index) => {
        if (!node) return
        const rect = node.getBoundingClientRect()
        const distance = Math.abs(rect.top + rect.height / 2 - targetLine)
        if (distance < best) { best = distance; closest = index }
      })
      setActive(previous => previous === closest ? previous : closest)
    }
    const onScroll = () => {
      if (frameRef.current) return
      frameRef.current = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  const selectStep = (index) => {
    const node = stepRefs.current[index]
    setActive(index)
    if (!node) return
    const mobile = window.matchMedia('(max-width: 760px)').matches
    const rect = node.getBoundingClientRect()
    const sightline = innerHeight * (mobile ? .79 : .5)
    const scrollTop = window.scrollY + rect.top + rect.height / 2 - sightline
    window.scrollTo({ top: Math.max(0, scrollTop), behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const handleStepKeyDown = (event, index) => {
    let next
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % STEPS.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + STEPS.length) % STEPS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = STEPS.length - 1
    else return
    event.preventDefault()
    selectStep(next)
    buttonsRef.current[next]?.focus({ preventScroll: true })
  }

  return (
    <section id="how-it-works" className="samhaal-how samhaal-how-scroll" aria-labelledby="samhaal-how-heading">
      <div className="samhaal-how-container">
        <header className="samhaal-how-intro">
          <span className="samhaal-how-eyebrow"><span aria-hidden="true">✳</span> HOW IT WORKS · FOLLOW THE FLOW</span>
          <div className="samhaal-how-intro-grid">
            <h2 id="samhaal-how-heading">Save the moment.<br /><em>Find it later.</em></h2>
            <div className="samhaal-how-intro-aside">
              <p>Four small steps. A lot less time trying to remember where you saw that one thing.</p>
              <span>Scroll down to watch each moment unfold.</span>
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

            <div className="samhaal-how-steps" aria-label="Samhaal's four-step product flow">
              {STEPS.map((step, index) => (
                <article
                  key={step.id}
                  ref={node => { stepRefs.current[index] = node }}
                  className={'samhaal-how-scroll-step' + (active === index ? ' is-active' : '')}
                  aria-label={'Step ' + step.number + ': ' + step.label}
                >
                  <button
                    ref={node => { buttonsRef.current[index] = node }}
                    id={'samhaal-how-tab-' + step.id}
                    type="button"
                    aria-current={active === index ? 'step' : undefined}
                    onClick={() => selectStep(index)}
                    onKeyDown={event => handleStepKeyDown(event, index)}
                    className={'samhaal-how-tab' + (active === index ? ' is-active' : '')}
                  >
                    <span className="samhaal-how-tab-index">{step.number}</span>
                    <span className="samhaal-how-tab-text">
                      <strong>{step.label}</strong>
                      <small>{step.short}</small>
                    </span>
                    <span className="samhaal-how-tab-arrow" aria-hidden="true">↗</span>
                  </button>
                  <div className="samhaal-how-step-content">
                    <span className="samhaal-how-step-kicker">{step.eyebrow}</span>
                    <h3>{step.heading}</h3>
                    <p>{step.description}</p>
                    <div className="samhaal-how-step-note">
                      <span aria-hidden="true">✓</span>
                      <div><strong>{step.detailTitle}</strong><small>{step.detail}</small></div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="samhaal-how-scroll-note">↓ Keep scrolling, or tap a step to jump there.</p>
          </div>

          <div
            className="samhaal-how-stage"
            id="samhaal-how-panel"
            aria-label="Samhaal in action"
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

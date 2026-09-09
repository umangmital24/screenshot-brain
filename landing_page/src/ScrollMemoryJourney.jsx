import { useEffect, useState } from 'react'

const STEPS = [
  {
    id: 'capture',
    number: '01',
    label: 'Capture',
    title: 'Save the screen you want to remember.',
    text: 'Tap the Samhaal bubble and keep moving. The screenshot stays in your Gallery while Samhaal starts understanding it.',
  },
  {
    id: 'understand',
    number: '02',
    label: 'Understand',
    title: 'Useful context rises above the UI noise.',
    text: 'A clear saved confirmation appears, then on-device OCR reads the screen and picks out the useful text instead of the surrounding UI.',
  },
  {
    id: 'organize',
    number: '03',
    label: 'Organize',
    title: 'A screenshot becomes a useful memory.',
    text: 'The important entity becomes a clean memory card with intent, title, source and useful context — ready to retrieve later.',
  },
  {
    id: 'ask',
    number: '04',
    label: 'Ask',
    title: 'Find it again like you remember it.',
    text: 'Ask naturally instead of searching filenames: “Which thrillers did I save?” Samhaal brings the right memory back with its source.',
  },
]

function PhoneScreen({ step }) {
  return (
    <div className={`journey-phone-screen is-step-${step}`} aria-live="polite">
      <div className="journey-statusbar">
        <span>9:41</span>
        <span className="journey-status-icons">● ◔</span>
      </div>

      <div className="journey-capture-card">
        <div className="journey-source-row">
          <span className="journey-source-avatar">I</span>
          <div>
            <strong>indiefilms.daily</strong>
            <span>Instagram</span>
          </div>
        </div>
        <div className="journey-poster">
          <div className="journey-poster-kicker">IF YOU LIKED DRISHYAM</div>
          <div className="journey-poster-title">Watch Raat Akeli Hai</div>
          <div className="journey-poster-sub">A slow-burn murder mystery</div>
          <div className="journey-ocr-box box-one" />
          <div className="journey-ocr-box box-two" />
          <div className="journey-ocr-box box-three" />
        </div>
        <div className="journey-social-noise">♡  1,842 &nbsp;&nbsp; ◯  42 &nbsp;&nbsp; ⤴</div>
      </div>

      <div className="journey-bubble-label">Tap to save</div>
      <div className="journey-samhaal-bubble">
        <span className="journey-bubble-s">S</span>
        <span className="journey-bubble-check">✓</span>
      </div>

      <div className="journey-save-confirm">
        <span className="journey-confirm-mark">✓</span>
        <div>
          <strong>Saved to Samhaal</strong>
          <span>Understanding this screen…</span>
        </div>
      </div>

      <div className="journey-memory-card">
        <div className="journey-memory-success">
          <span>✓</span>
          <strong>Memory ready</strong>
        </div>
        <div className="journey-memory-topline">
          <span className="journey-memory-intent">WATCH LATER</span>
          <span className="journey-memory-source">Instagram</span>
        </div>
        <span className="journey-memory-eyebrow">Saved memory</span>
        <strong>Raat Akeli Hai</strong>
        <p>Slow-burn Hindi murder mystery</p>
        <div className="journey-memory-meta">
          <span>Movie</span><span>Thriller</span><span>Saved now</span>
        </div>
      </div>

      <div className="journey-ask-view">
        <div className="journey-ask-brand">Ask Samhaal</div>
        <div className="journey-user-question">Which thrillers did I save?</div>
        <div className="journey-answer">
          <span className="journey-answer-mark">S</span>
          <div>
            <p>You saved <strong>Raat Akeli Hai</strong>, a Hindi murder mystery.</p>
            <div className="journey-source-chip">Source · Raat Akeli Hai</div>
          </div>
        </div>
      </div>

      <div className="journey-processing-line">
        <span />
      </div>
    </div>
  )
}

export default function ScrollMemoryJourney() {
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('[data-journey-step]'))
    if (!nodes.length) return undefined

    let ticking = false

    const updateStep = () => {
      const targetY = window.innerHeight * 0.5
      let bestIndex = 0
      let bestDistance = Infinity

      nodes.forEach((node, index) => {
        const rect = node.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const distance = Math.abs(center - targetY)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      })

      setActiveStep(bestIndex)
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        updateStep()
        ticking = false
      })
    }

    updateStep()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const currentStep = STEPS[activeStep]

  return (
    <div className="memory-journey" aria-label="How Samhaal turns a screenshot into a searchable memory">
      <div className="memory-journey-copy">
        <div className="memory-journey-thread" aria-hidden="true">
          <div className="memory-journey-thread-fill" style={{ transform: `scaleY(${(activeStep + 1) / STEPS.length})` }} />
        </div>

        {STEPS.map((item, index) => (
          <article
            key={item.id}
            className={`memory-journey-step ${activeStep === index ? 'is-active' : ''}`}
            data-journey-step={index}
          >
            <div className="memory-journey-step-head">
              <span className="memory-journey-number">{item.number}</span>
              <span className="memory-journey-label">{item.label}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      <div className="memory-journey-visual">
        <div className="journey-phone-wrap">
          <div className="journey-phone">
            <div className="journey-phone-speaker" />
            <PhoneScreen step={activeStep} />
          </div>
          <div className="journey-stage-caption">
            <span>{currentStep.number}</span>
            <strong>{currentStep.label}</strong>
          </div>
          <div className="journey-mobile-copy" aria-live="polite">
            <h3>{currentStep.title}</h3>
            <p>{currentStep.text}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

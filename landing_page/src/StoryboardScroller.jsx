import { useEffect, useRef, useState } from 'react'

/**
 * A product narrative told through the seven Samhaal storyboard frames.
 * The images live under public/story/ and are optimized for the web.
 * No animation library: IntersectionObserver + CSS transform/opacity.
 */
const CHAPTERS = [
  {
    number: '01',
    eyebrow: 'THE PROBLEM',
    title: 'You saved it. Then lost it.',
    description: 'That café, book, recipe or idea deserved better than getting buried in your camera roll.',
    image: '/story/01.webp',
    alt: 'A phone gallery full of screenshots, with a reminder of how easily saved ideas get lost.',
    note: 'Every screenshot starts as something worth remembering.',
  },
  {
    number: '02',
    eyebrow: 'MEET SAMHAAL',
    title: 'Your second memory, finally.',
    description: 'Meet Samhaal (संभाल). The place where the things you screenshot become things you can actually find.',
    image: '/story/02.webp',
    alt: 'Samhaal introductory screen demonstrating searchable memories and privacy-first capture.',
    note: 'Capture. Save. Find. Anytime.',
  },
  {
    number: '03',
    eyebrow: 'ALL IN ONE PLACE',
    title: 'The little things add up.',
    description: 'The coffee shops, travel ideas, products and code snippets you wanted to revisit, neatly together.',
    image: '/story/03.webp',
    alt: 'Samhaal memories dashboard organizing cafés, travel, recipes, code and reading material.',
    note: 'From scattered screenshots to meaningful memories.',
  },
  {
    number: '04',
    eyebrow: 'SAVE WITH INTENT',
    title: 'Keep this one.',
    description: 'Take your screenshot as usual. Decide what matters and save it straight to Samhaal.',
    image: '/story/04.webp',
    alt: 'A screenshot preview with an option to Save to Samhaal or ignore.',
    note: 'You are always in control of what gets saved.',
  },
  {
    number: '05',
    eyebrow: 'ONE-TAP CAPTURE',
    title: 'See it. Tap. Remember.',
    description: 'Spot something useful? The Samhaal save bubble can capture it without creating another gallery screenshot.',
    image: '/story/05.webp',
    alt: 'Samhaal save bubble capturing a café page with a saved confirmation.',
    note: 'Less friction. More remembering.',
  },
  {
    number: '06',
    eyebrow: 'BRING YOUR PAST',
    title: 'Old screenshots, new purpose.',
    description: 'Already have hundreds? Bring them along in batches and turn yesterday’s saved moments into a useful library.',
    image: '/story/06.webp',
    alt: 'Bulk screenshot selection screen adding multiple old captures to Samhaal.',
    note: 'Your memories do not have to start today.',
  },
  {
    number: '07',
    eyebrow: 'THE PAYOFF',
    title: 'A month later. There it is.',
    description: 'Ask what you remember, in your own words. Samhaal helps you find the saved source, not just a matching filename.',
    image: '/story/07.webp',
    alt: 'Ask Samhaal responding to a natural-language café question with a referenced saved memory.',
    note: 'Remember the moment. Find the memory.',
  },
]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export default function StoryboardScroller() {
  const rootRef = useRef(null)
  const stepRefs = useRef([])
  const [active, setActive] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    let frame = 0
    const update = () => {
      frame = 0
      const viewportTarget = window.innerHeight * (window.innerWidth <= 760 ? 0.78 : 0.46)
      let nearest = 0
      let nearestDistance = Infinity

      stepRefs.current.forEach((node, index) => {
        if (!node) return
        const rect = node.getBoundingClientRect()
        const distance = Math.abs(rect.top + rect.height / 2 - viewportTarget)
        if (distance < nearestDistance) {
          nearest = index
          nearestDistance = distance
        }
      })
      setActive(nearest)
    }

    const onMove = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onMove, { passive: true })
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove)
      window.removeEventListener('resize', onMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    // Reveal ordinary landing sections when they enter the viewport.
    const nodes = document.querySelectorAll(
      '.landing-section-header, .feature-card, .trust-simple-card, .comparison-card, .platform-card'
    )
    if (!('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('samhaal-is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.07, rootMargin: '0px 0px -24px 0px' })
    nodes.forEach((node) => {
      node.classList.add('samhaal-reveal')
      observer.observe(node)
    })
    return () => observer.disconnect()
  }, [])

  const goTo = (index) => {
    const next = clamp(index, 0, CHAPTERS.length - 1)
    setActive(next)
    stepRefs.current[next]?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    })
  }

  return (
    <section className="samhaal-story" id="story" ref={rootRef} aria-label="The Samhaal product story">
      <div className="samhaal-story-intro">
        <div className="samhaal-story-kicker"><span className="samhaal-sparkle" aria-hidden="true">✳</span> A BETTER WAY TO REMEMBER</div>
        <h2>Life is worth <em>remembering.</em><br />Your screenshots are, too.</h2>
        <p>Seven little moments. One beautifully simple way to keep what matters.</p>
        <div className="samhaal-scroll-hint" aria-hidden="true"><span>SCROLL TO EXPLORE</span><span className="samhaal-hint-line" /></div>
      </div>
      <div className="samhaal-story-layout">
        <div className="samhaal-story-copy">
          {CHAPTERS.map((chapter, index) => (
            <article
              className={'samhaal-story-step' + (active === index ? ' is-active' : '')}
              key={chapter.number}
              ref={(el) => { stepRefs.current[index] = el }}
              aria-current={active === index ? 'step' : undefined}
            >
              <div className="samhaal-chapter-index"><span>{chapter.number}</span><span className="samhaal-chapter-rule" />07</div>
              <span className="samhaal-chapter-eyebrow">{chapter.eyebrow}</span>
              <h3>{chapter.title}</h3>
              <p>{chapter.description}</p>
              <div className="samhaal-chapter-note"><span className="samhaal-note-symbol" aria-hidden="true">↗</span>{chapter.note}</div>
              {index === CHAPTERS.length - 1 && (
                <a href="#waitlist" className="samhaal-story-final-cta">
                  Join early access <span aria-hidden="true">↗</span>
                </a>
              )}
            </article>
          ))}
        </div>

        <div className="samhaal-story-stage">
          <div className="samhaal-stage-topline">
            <span className="samhaal-stage-label"><span className="samhaal-live-dot" /> THE SAMHAAL STORY</span>
            <span className="samhaal-stage-count" aria-live="polite">{CHAPTERS[active].number} <span>/ 07</span></span>
          </div>
          <div className="samhaal-stage-window">
            <div className="samhaal-stage-halo halo-one" aria-hidden="true" />
            <div className="samhaal-stage-halo halo-two" aria-hidden="true" />
            <div className="samhaal-stage-frames">
              {/* The original seven screenshot crops are shown when their assets are available.
                  Keep the fallback intentionally simple: never recreate app UI with CSS. */}
              <div className="samhaal-story-image-placeholder" aria-hidden="true">
                <span className="samhaal-placeholder-logo">✳</span>
                <strong>Samhaal <span>संभाल</span></strong>
                <small>Save now. Find it when it matters.</small>
              </div>
              {CHAPTERS.map((chapter, index) => (
                <img
                  key={chapter.number}
                  src={chapter.image}
                  alt={chapter.alt}
                  className={'samhaal-stage-image' + (active === index ? ' is-current' : '')}
                  loading={index < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={(event) => { event.currentTarget.style.display = 'none' }}
                  aria-hidden={active !== index}
                />
              ))}
            </div>
            <span className="samhaal-stage-stamp" aria-hidden="true">aapne snap kiya,<br />humne samhaala.</span>
          </div>
          <div className="samhaal-stage-bottomline">
            <div className="samhaal-progress" aria-label="Story progress">
              {CHAPTERS.map((chapter, index) => (
                <button
                  key={chapter.number}
                  type="button"
                  className={'samhaal-progress-dot' + (index === active ? ' is-current' : '')}
                  onClick={() => goTo(index)}
                  aria-label={'Go to chapter ' + (index + 1) + ': ' + chapter.title}
                  aria-current={index === active ? 'step' : undefined}
                />
              ))}
            </div>
            <div className="samhaal-stage-controls">
              <button type="button" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous chapter">←</button>
              <button type="button" onClick={() => goTo(active + 1)} disabled={active === CHAPTERS.length - 1} aria-label="Next chapter">→</button>
            </div>
          </div>
        </div>
      </div>
      <div className="samhaal-story-outro">
        <span className="samhaal-story-outro-symbol" aria-hidden="true">✳</span>
        <p>The screenshots you save today.<br /><strong>The moments you find tomorrow.</strong></p>
        <a href="#waitlist">Be among the first to try Samhaal <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  )
}

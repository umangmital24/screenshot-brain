import React, { useEffect } from 'react'

const pageStyle = {
  minHeight: '100vh',
  background: '#fff',
  color: '#111',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const containerStyle = {
  width: 'min(900px, calc(100% - 40px))',
  margin: '0 auto',
}

function usePageMeta() {
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector('meta[name="description"]')
    const canonical = document.querySelector('link[rel="canonical"]')
    const previousDescription = description?.getAttribute('content')
    const previousCanonical = canonical?.getAttribute('href')

    document.title = 'About Samhaal – AI Screenshot Memory App'
    description?.setAttribute(
      'content',
      'Learn why Samhaal was built: to turn forgotten screenshots into useful, searchable memories while keeping privacy at the center.'
    )
    canonical?.setAttribute('href', 'https://samhaal.vercel.app/about')

    return () => {
      document.title = previousTitle
      if (description && previousDescription) description.setAttribute('content', previousDescription)
      if (canonical && previousCanonical) canonical.setAttribute('href', previousCanonical)
    }
  }, [])
}

export default function AboutPage() {
  usePageMeta()

  return (
    <div style={pageStyle}>
      <header style={{ borderBottom: '1px solid #ececec' }}>
        <div style={{ ...containerStyle, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ color: '#111', textDecoration: 'none', fontWeight: 750, fontSize: 22 }}>
            Samhaal <span style={{ fontWeight: 500, color: '#777', fontSize: 16 }}>संभाल</span>
          </a>
          <a href="/" style={{ color: '#444', textDecoration: 'none', fontSize: 14 }}>← Back to home</a>
        </div>
      </header>

      <main style={{ ...containerStyle, padding: '88px 0 100px' }}>
        <p style={{ margin: 0, color: '#777', fontSize: 14, fontWeight: 650, letterSpacing: '.08em', textTransform: 'uppercase' }}>About Samhaal</p>
        <h1 style={{ fontSize: 'clamp(42px, 7vw, 72px)', lineHeight: 1.03, letterSpacing: '-0.045em', margin: '18px 0 28px', maxWidth: 800 }}>
          Screenshots are easy to save. Finding them later shouldn't be hard.
        </h1>
        <p style={{ fontSize: 21, lineHeight: 1.65, color: '#4b4b4b', maxWidth: 760 }}>
          Samhaal is an AI-powered screenshot memory app built to turn the things you save into memories you can actually retrieve later.
        </p>

        <section style={{ marginTop: 72, borderTop: '1px solid #e8e8e8', paddingTop: 48 }}>
          <h2 style={{ fontSize: 32, letterSpacing: '-0.025em', marginBottom: 18 }}>Why it exists</h2>
          <p style={{ fontSize: 18, lineHeight: 1.8, color: '#4b4b4b' }}>
            Jobs, books, restaurants, products, posts, recipes and ideas often end up buried in a camera roll. Samhaal is designed around a simple idea: if something was important enough to screenshot, it should be easy to find again.
          </p>
        </section>

        <section style={{ marginTop: 56 }}>
          <h2 style={{ fontSize: 32, letterSpacing: '-0.025em', marginBottom: 18 }}>How Samhaal thinks about memory</h2>
          <p style={{ fontSize: 18, lineHeight: 1.8, color: '#4b4b4b' }}>
            Instead of treating screenshots as a folder of images, Samhaal extracts useful context and organizes it into structured memories. You can then search naturally — for example, “What AI jobs did I save?” or “Which restaurants did I want to try?”
          </p>
        </section>

        <section style={{ marginTop: 56 }}>
          <h2 style={{ fontSize: 32, letterSpacing: '-0.025em', marginBottom: 18 }}>Privacy is part of the product</h2>
          <p style={{ fontSize: 18, lineHeight: 1.8, color: '#4b4b4b' }}>
            Samhaal's default Android capture flow performs OCR on-device. The screenshot remains in your Gallery, while Samhaal stores a local reference to it and sends extracted text and supporting metadata for memory processing. The goal is to minimize what needs to leave your device.
          </p>
          <a href="/privacy" style={{ display: 'inline-block', marginTop: 12, color: '#111', fontWeight: 650 }}>Read our privacy approach →</a>
        </section>

        <section style={{ marginTop: 72, padding: '38px 40px', background: '#111', color: '#fff', borderRadius: 22 }}>
          <h2 style={{ fontSize: 30, margin: '0 0 12px', letterSpacing: '-0.025em' }}>Samhaal is currently being validated with early users.</h2>
          <p style={{ margin: '0 0 24px', color: '#c9c9c9', lineHeight: 1.7, fontSize: 17 }}>
            If screenshot overload sounds familiar, join the waitlist and help shape what Samhaal becomes.
          </p>
          <a href="/#waitlist" style={{ display: 'inline-block', background: '#fff', color: '#111', padding: '12px 18px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>Join the waitlist</a>
        </section>
      </main>
    </div>
  )
}

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

    document.title = 'Privacy – Samhaal'
    description?.setAttribute(
      'content',
      'Learn how Samhaal handles screenshots, on-device OCR, extracted text, local screenshot references and analytics.'
    )
    canonical?.setAttribute('href', 'https://samhaal.vercel.app/privacy')

    return () => {
      document.title = previousTitle
      if (description && previousDescription) description.setAttribute('content', previousDescription)
      if (canonical && previousCanonical) canonical.setAttribute('href', previousCanonical)
    }
  }, [])
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: 52 }}>
      <h2 style={{ fontSize: 30, letterSpacing: '-0.025em', marginBottom: 16 }}>{title}</h2>
      <div style={{ fontSize: 17, lineHeight: 1.8, color: '#4b4b4b' }}>{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
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
        <p style={{ margin: 0, color: '#777', fontSize: 14, fontWeight: 650, letterSpacing: '.08em', textTransform: 'uppercase' }}>Privacy</p>
        <h1 style={{ fontSize: 'clamp(42px, 7vw, 68px)', lineHeight: 1.04, letterSpacing: '-0.045em', margin: '18px 0 20px' }}>
          Privacy is part of how Samhaal is designed.
        </h1>
        <p style={{ fontSize: 20, lineHeight: 1.65, color: '#4b4b4b', maxWidth: 760 }}>
          This page explains the current privacy approach for Samhaal's early Android experience. The product is still evolving, so this page will be updated as features change.
        </p>
        <p style={{ marginTop: 16, color: '#777', fontSize: 14 }}>Last updated: September 9, 2026</p>

        <Section title="What happens when you save a screen">
          <p>
            In the default Android Save Bubble flow, Samhaal captures the screen and performs OCR on-device using Android ML Kit. A screenshot is saved to your device's Gallery under the Samhaal folder. Samhaal stores a local reference to that Gallery image so it can be shown again inside the app.
          </p>
        </Section>

        <Section title="What is sent for AI processing">
          <p>
            Samhaal's default capture flow sends extracted OCR text and supporting metadata needed to organize the memory, such as capture time, source-app information and OCR layout information. The raw screenshot image is not sent to the AI/backend by default in this flow.
          </p>
        </Section>

        <Section title="What stays on your device">
          <p>
            The screenshot created by the Save Bubble remains in your device Gallery. Samhaal keeps a local content URI reference to that image rather than maintaining a second private duplicate. If you delete the screenshot from your Gallery, the text-based memory can remain while the local image reference may stop working.
          </p>
        </Section>

        <Section title="Memories and account data">
          <p>
            Structured memory data associated with your account may be stored in Samhaal's backend so your saved information can be searched and used by Ask Samhaal. Authentication and data access controls are used to separate user data.
          </p>
        </Section>

        <Section title="Website analytics">
          <p>
            The public Samhaal website uses Vercel Analytics to understand basic website usage such as visits and traffic patterns. We use this to improve the website and understand interest in Samhaal. Website analytics are not used to inspect your screenshots, extracted memories, or private app content.
          </p>
        </Section>

        <Section title="Cloud screenshot backup">
          <p>
            Cloud screenshot backup is not part of the default local screenshot flow described above. If Samhaal introduces cloud screenshot backup, it is intended to be an explicit opt-in feature rather than silently changing the default privacy model.
          </p>
        </Section>

        <Section title="Product changes">
          <p>
            Samhaal is in an early stage. Privacy details may change as the Android app, synchronization, account features and optional cloud capabilities evolve. When the handling of user data changes materially, this page should be updated to reflect the new behavior.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            If you have questions about this privacy page, your data, or Samhaal's privacy practices, email us at{' '}
            <a href="mailto:hello.samhaal@gmail.com" style={{ color: '#111', fontWeight: 650 }}>hello.samhaal@gmail.com</a>.
          </p>
        </Section>

        <div style={{ marginTop: 70, paddingTop: 28, borderTop: '1px solid #e8e8e8', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <a href="/" style={{ color: '#111', fontWeight: 650 }}>Home</a>
          <a href="/about" style={{ color: '#111', fontWeight: 650 }}>About Samhaal</a>
          <a href="mailto:hello.samhaal@gmail.com" style={{ color: '#111', fontWeight: 650 }}>Contact</a>
        </div>
      </main>
    </div>
  )
}

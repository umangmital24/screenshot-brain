const providedUrl = import.meta.env.VITE_ANDROID_APK_URL?.trim() || ''
const downloadUrl = /^(https:\/\/|\/downloads\/)/i.test(providedUrl) ? providedUrl : ''

export default function GetAppPage() {
  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <a className="portal-brand" href="/">Samhaal <span>संभाल</span></a>
        <a href="/login" className="portal-text-link">Log in →</a>
      </header>
      <section className="portal-auth-card portal-download-card">
        <p className="portal-eyebrow">SAMHAAL FOR ANDROID</p>
        <h1>Save it on your phone. Find it anywhere.</h1>
        <p className="portal-muted">Samhaal captures the meaning behind your screenshots on Android and lets you revisit saved memories from the web.</p>
        {downloadUrl ? (
          <>
            <a className="portal-button portal-primary portal-button-link" href={downloadUrl} rel="noopener noreferrer" download={downloadUrl.startsWith('/')} target={downloadUrl.startsWith('/') ? undefined : '_blank'}>
              Download Samhaal for Android ↓
            </a>
            <p className="portal-privacy-note">Install only the APK provided through Samhaal's official website.</p>
          </>
        ) : (
          <>
            <div className="portal-availability"><span className="portal-status-dot" /> Android download coming soon</div>
            <p className="portal-muted">The download link will appear here as soon as the Android app is published. No APK has been uploaded yet.</p>
          </>
        )}
        <a className="portal-back-link" href="/">← Back to Samhaal</a>
      </section>
    </main>
  )
}

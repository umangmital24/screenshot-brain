# Samhaal Landing Page

Landing page for **Samhaal (संभाल)** with Supabase login, Android download navigation, Vercel Analytics, and SEO metadata.

## Run locally

```bash
npm install
npm run dev
```

`predev` and `prebuild` automatically reconstruct the exact landing page component and stylesheet from the ordered files in `src/fragments/` before Vite starts.

## Environment variables

Create a local `.env` from `.env.example`:

```env
VITE_API_BASE=https://screenshot-brain-1.onrender.com
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Never put a Supabase service-role key in the frontend.

## Included

- Existing Samhaal landing page UI
- Vercel Analytics page-view tracking
- SEO title and meta description
- Canonical URL
- Open Graph metadata
- Twitter metadata
- `SoftwareApplication` JSON-LD
- `public/robots.txt`
- `public/sitemap.xml`

## Deployment branch mapping

Use **two deployments of the same GitHub repository**. Do not merge the
landing-page branch into the backend branch just to deploy the website.

| Service | GitHub branch | Root directory | Command |
| --- | --- | --- | --- |
| FastAPI backend (Render) | `main` | repository root | `bash start.sh` (match your existing backend service configuration) |
| Vite/React website (Vercel) | `feature/samhaal-landing-seo` | `landing_page` | `npm run build` |

For the **Vercel website project**, choose `feature/samhaal-landing-seo`
as its *Production Branch* and set its Root Directory to `landing_page`.
For the **Render API service**, choose `main` as its deploy branch; do not
change its existing worker or runtime configuration.

Set `VITE_API_BASE` in Vercel to the HTTPS URL of the **main-branch**
Render API, not to a Vercel URL or a branch name. Both frontend and backend
must reference the same Supabase project, and the backend must include the
website origin in `ALLOWED_ORIGINS`.

No raw screenshot uploads or cloud image backup are part of the website.

## Vercel deployment

When connecting this repository to Vercel, set the project **Root Directory** to:

```text
landing_page
```

Build command:

```bash
npm run build
```

The `prebuild` hook reconstructs `src/LandingPage.jsx` and `src/index.css` automatically.

After deployment, verify:

```text
https://samhaal.vercel.app/
https://samhaal.vercel.app/robots.txt
https://samhaal.vercel.app/sitemap.xml
```

Then add `https://samhaal.vercel.app/` to Google Search Console, submit `sitemap.xml`, and request indexing for the homepage.

## Motion-led seven-step product story

The home page includes a sticky, seven-chapter interactive story driven by `src/StoryboardScroller.jsx` and `src/storyboard.css`. It supports responsive layout, direct progress navigation, reduced-motion accessibility, and a CSS phone fallback while the images are unavailable.

The seven original phone screenshots are now included at `public/story/01.webp` through `public/story/07.webp`. The CSS imitation phone and its overlapping cards have been removed. The story uses a minimal brand placeholder only if a file fails to load.

The primary navigation now links to `#story`. The former early-access / waitlist sections and signup form have been removed in favor of direct Login and Get App actions. A GitHub Actions workflow (`.github/workflows/samhaal-website-build.yml`) checks Vite builds on changes to this branch.

## Samhaal Web dashboard UI (v2)

The logged-in `/dashboard` now mirrors the Android app design tokens from
`android_app/src/theme.js`: white canvas, `#09090B` ink, subtle gray
borders, rounded memory cards, and a restrained black/white accent system.

Desktop web has persistent sidebar navigation (Overview, All Memories, Ask
Samhaal, Completed, and intent categories), a searchable memory library,
quick completion controls, a metadata detail/edit drawer, and a dedicated
Ask conversation with clickable memory sources. Mobile browsers receive
touch-friendly cards and a bottom tab bar. Keyboard shortcut **Ctrl/⌘+K**
opens the memory search.

All memory data flows through the existing authenticated FastAPI endpoints
(`/memories`, `/memories/summary`, `PATCH/DELETE /memories/{id}`,
and `/chat`). The web UI never displays or uploads the original screenshot
images; it only uses extracted text and metadata. Design source files:
`src/DashboardPage.jsx` and `src/dashboard-v2.css`.

## Samhaal Web login and Android download

- The landing-page header and mobile menu now link to `/login` and `/get-app`.
- `/login` uses the **same Supabase Auth project** as Android: existing-account email magic links and email/password. Browser Google login is temporarily disabled.
- `/auth/callback` completes email magic-link sessions, with legacy PKCE callback compatibility.
- After sign-in, `/dashboard` lists saved memory metadata and supports text search, intent/status filters, completion updates and Ask Samhaal through the existing FastAPI backend.
- Screenshots are **not uploaded, backed up, or rendered** in the web experience.
- `/get-app` displays an Android download coming-soon message until the APK URL is configured with `VITE_ANDROID_APK_URL`. Set it to a hosted HTTPS APK or a same-site `/downloads/...` asset, then redeploy.

### Required deployment configuration

The web Supabase client falls back to the **same public Supabase URL and publishable key used by Android on `main`**. This allows existing Samhaal users to log in without setting separate Vercel auth variables. For production maintainability, optionally set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel to that same project (these override the fallback); `VITE_API_BASE` must point to your deployed FastAPI service. Never expose Supabase service-role keys to the frontend. If the Android Supabase project changes in the future, keep the website configuration in sync.

In Supabase Auth settings, allow `https://YOUR-WEB-DOMAIN/auth/callback` as an OAuth/email redirect URL, and configure the Google provider appropriately. Configure FastAPI `ALLOWED_ORIGINS` to include the exact web origin (and your local Vite dev origin). The web app sends Supabase access tokens in Authorization Bearer headers to the existing protected API routes.


Email magic links require the site's `/auth/callback` URL to be allowlisted in Supabase Auth. The public website no longer presents or submits any waitlist form; the old `/waitlist` backend endpoint is unchanged for compatibility.

The existing product story and FAQ remain available. The `prebuild` reconstructs `LandingPage.jsx` from `src/fragments/LandingPage.part*.txt`: **edit the fragment**, not the generated JSX, for future landing-page navigation changes.

### Browser sign-in while Google Console access is unavailable

The Android app continues to use Google ID-token sign-in. Web Google sign-in
is temporarily hidden because Google's Web Client ID does not authorize
`https://samhaal.vercel.app` as a JavaScript origin, and Supabase's server-side
Google Client Secret is invalid. Reusing an Android ID does not remove the
browser-origin restriction. **Do not expose a Google client secret in Vercel.**

For now, web offers `supabase.auth.signInWithOtp()` email magic links with
`shouldCreateUser: false`, plus the existing email/password option.
Existing Android Google users should enter the **same Google account email**.
Magic link sessions are handled through the browser implicit flow at
`/auth/callback`. No new Supabase user is intentionally created by this
existing-user magic link flow. Users should open the email link in the same
browser they initiated sign-in from.

Email login requires Supabase Auth email sending to work, and may need
SMTP configuration or sufficient email delivery quota. The Supabase
authentication redirect allowlist must include
`https://samhaal.vercel.app/auth/callback`. Verify the logged-in
Supabase user ID matches the Android user ID before concluding
cross-device memory sync works. No image backups are part of the flow.

Web Google login can be restored only once someone with Google Cloud Console
access authorizes the website JavaScript origin and validates the matching
Google OAuth credentials.

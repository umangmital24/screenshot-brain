# Samhaal Landing Page

Landing page for **Samhaal (संभाल)** with waitlist capture, Vercel Analytics, and SEO metadata.

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
- Waitlist POST integration
- Vercel Analytics page-view tracking
- `waitlist_signup` conversion event
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

The primary navigation now links to `#story`. Existing FAQ, waitlist, and metadata are preserved. A GitHub Actions workflow (`.github/workflows/samhaal-website-build.yml`) checks Vite builds on changes to this branch.

## Samhaal Web login and Android download

- The landing-page header and mobile menu now link to `/login` and `/get-app`.
- `/login` uses the **same Supabase Auth project** as Android: Google OAuth and email/password.
- `/auth/callback` exchanges the PKCE OAuth code for a web session.
- After sign-in, `/dashboard` lists saved memory metadata and supports text search, intent/status filters, completion updates and Ask Samhaal through the existing FastAPI backend.
- Screenshots are **not uploaded, backed up, or rendered** in the web experience.
- `/get-app` displays an Android download coming-soon message until the APK URL is configured with `VITE_ANDROID_APK_URL`. Set it to a hosted HTTPS APK or a same-site `/downloads/...` asset, then redeploy.

### Required deployment configuration

The web Supabase client falls back to the **same public Supabase URL and publishable key used by Android on `main`**. This allows existing Samhaal users to log in without setting separate Vercel auth variables. For production maintainability, optionally set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel to that same project (these override the fallback); `VITE_API_BASE` must point to your deployed FastAPI service. Never expose Supabase service-role keys to the frontend. If the Android Supabase project changes in the future, keep the website configuration in sync.

In Supabase Auth settings, allow `https://YOUR-WEB-DOMAIN/auth/callback` as an OAuth/email redirect URL, and configure the Google provider appropriately. Configure FastAPI `ALLOWED_ORIGINS` to include the exact web origin (and your local Vite dev origin). The web app sends Supabase access tokens in Authorization Bearer headers to the existing protected API routes.


Note: the public `/waitlist` form uses the FastAPI `/waitlist` endpoint and its server-side Supabase connection, so working waitlist submissions do **not** mean browser Supabase Auth is configured. Google login on web additionally requires the site's `/auth/callback` URL to be allowlisted in Supabase Auth.

The existing waitlist and marketing story remain unchanged. The `prebuild` reconstructs `LandingPage.jsx` from `src/fragments/LandingPage.part*.txt`: **edit the fragment**, not the generated JSX, for future landing-page navigation changes.

### Google sign-in without the OAuth Client Secret exchange

The web login uses Google Identity Services (GIS) to obtain a Google **ID token**,
then `supabase.auth.signInWithIdToken({ provider: 'google', token })`, matching
the existing Android sign-in path. It reuses the **public Web Client ID** from
`android_app/src/screens/LoginScreen.js` on `main`.
`VITE_GOOGLE_WEB_CLIENT_ID` is an optional override for future rotations.
Do not put any Google Client Secret in frontend code or Vercel public variables.

In Google Cloud Console > Google Auth Platform > Clients > the **Web**
OAuth Client matching Android's `GOOGLE_WEB_CLIENT_ID`, add
`https://samhaal.vercel.app` to **Authorized JavaScript origins**.
This browser-origin requirement is independent of the Android client.
The Supabase Google provider must include that Web Client ID among
its allowed Client IDs. The existing mobile Google sign-in being functional
does not prove the browser origin is registered.

This ID-token approach avoids the failing Google authorization-code exchange
(the invalid Client Secret error in Supabase Auth logs). Email/password
authentication and callback handling for email confirmation are unchanged.

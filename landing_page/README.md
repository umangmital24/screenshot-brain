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

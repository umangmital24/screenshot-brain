# Samhaal Android beta

This project is based on the supplied Expo/React Native app and keeps its existing auth, share-intent, background screenshot watcher, backend memories, and chat plumbing.

## What changed

- Rebranded the user-facing app from **The Catalog** to **Samhaal**.
- Replaced the dark neon UI with the same minimalist white/black design language as the Samhaal landing page.
- Simplified navigation to **Memories** and **Ask**.
- Added a local search field and cleaner intent filters to Memories.
- Made conversational retrieval a first-class **Ask your memory** experience with prompt suggestions and source cards.
- Added Google ML Kit Text Recognition as a native Android module.
- Changed screenshot ingestion to **on-device OCR -> POST /screenshot/metadata**. The normal mobile flow no longer uploads the raw screenshot to the backend.
- Updated auto-save detection to pass a MediaStore `content://` URI instead of relying on a raw filesystem path.
- Updated the Android overlay prompt to the Samhaal visual language.

## Required mobile environment variables

Copy `.env.example` to `.env` and set:

```env
EXPO_PUBLIC_API_BASE=https://screenshot-brain-1.onrender.com
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com
```

The Supabase **anon** key is expected in the mobile app. Never place the service-role key in a mobile build.

## Backend expectation

The app expects the hardening backend branch/API that includes:

- `POST /screenshot/metadata`
- `GET /memories`
- `GET /memories/summary`
- `POST /chat`

`/screenshot/metadata` accepts on-device OCR text and organizes it into Samhaal memories.

## Run

This project contains custom Android native modules, so use a development/native build rather than Expo Go:

```bash
npm install
npx expo run:android
```

For an EAS build, keep the existing native `android/` directory committed.

## Important beta notes

- The included ML Kit recognizer currently bundles the Latin-script model. Add the Devanagari ML Kit recognizer before advertising full Hindi OCR inside the Android beta.
- The optional always-on screenshot watcher uses Android overlay + foreground-service behavior. This should be reviewed against current Google Play foreground-service and overlay policies before Play Store production submission.
- Auto-save detection is intentionally optional. Share-to-Samhaal/manual import remains the lower-permission fallback.

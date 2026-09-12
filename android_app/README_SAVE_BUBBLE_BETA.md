# Samhaal Android — Save Bubble Beta

This build changes Android capture from passive screenshot watching to an explicit, user-triggered **Save Bubble**.

## User flow

1. Sign in to Samhaal.
2. The Memories screen explains the Save Bubble and shows a one-time Accessibility setup guide.
3. Tap **Continue to Accessibility** and enable **Samhaal Save Bubble** in Android settings.
4. A draggable `✦` bubble appears at the edge of the screen.
5. While using any app, tap the bubble when you want Samhaal to remember the current screen.
6. Android captures the screen in memory, ML Kit OCR reads it locally, and the raw pixels are discarded.
7. Only OCR text is sent to `POST /screenshot/metadata` using the signed-in user's session.
8. The bubble stays in a processing state until the backend confirms the memory was saved, then briefly shows `✓`.

## Privacy boundary

The AccessibilityService intentionally does **not** retrieve the accessibility node tree, read text fields, inspect taps, or react to other apps' accessibility events. It uses Accessibility only for:

- `TYPE_ACCESSIBILITY_OVERLAY` to display the edge bubble.
- `AccessibilityService.takeScreenshot()` after the user taps the bubble.

`android:canRetrieveWindowContent` is explicitly `false`.

## Android support

The direct screenshot API used by this beta requires Android 11 / API 30 or newer. On older Android versions the UI explains that the Save Bubble is unsupported.

Secure windows (for example apps/screens using Android `FLAG_SECURE`) may reject screenshot capture. Samhaal shows an error instead of trying to bypass that protection.

## UI direction

The main Memories screen is intentionally minimal:

- Samhaal header
- one Save Bubble status/setup card
- one privacy sentence
- memory cards

If the account has no memories yet, three example cards show exactly how Apply, Visit and Read memories will look. The second tab remains **Ask** for natural-language retrieval.

## Environment

Copy `.env.example` to `.env` and set:

```env
EXPO_PUBLIC_API_BASE=https://screenshot-brain-1.onrender.com
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com
```

Never put the Supabase service-role key in the mobile app.

## Run

This app contains custom Android native code, so use a native/dev build rather than Expo Go:

```bash
npm install
npx expo run:android
```

Do not run `expo prebuild --clean` unless you first convert the custom native accessibility service into a config plugin; a clean prebuild can replace native project files.

## Google Play note

Samhaal is not a disability-focused accessibility tool and therefore must not declare `isAccessibilityTool=true`. Before Play Store release, complete the Accessibility API declaration and provide the prominent in-app disclosure/consent required for this use.

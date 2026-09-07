# Base app review — Samhaal Android

## What is already strong

The supplied app is a useful functional base, not just a UI shell. It already has:

- Supabase email/password + Google sign-in.
- Authenticated FastAPI calls.
- Android share-intent support for sharing a screenshot into the app.
- A custom Android foreground service that watches MediaStore for new screenshots.
- An optional overlay prompt for Save / Dismiss.
- A headless JS task for processing a screenshot when the UI is not open.
- Intent-based memory filters and counts.
- Conversational search/chat against saved memories.

Keeping this foundation is faster and lower-risk than starting a new native app from zero.

## Problems found in the original base

### 1. Privacy architecture did not match the landing page

The original `uploadScreenshot()` uploaded the raw screenshot to `POST /screenshot`. That contradicts the intended product promise that raw screenshots are processed locally first and are not sent to AI models.

**Changed in this beta:** Android now runs Google ML Kit OCR locally and sends only `extracted_text` to `POST /screenshot/metadata`.

### 2. The mobile visual language did not match Samhaal

The original app used a black background, mint-green accents, “The Catalog”, “Reference Desk”, and stamp-like memory cards. The public Samhaal site uses a white canvas, near-black type, restrained borders, and simpler language.

**Changed in this beta:** mobile now uses the same white/black visual system and Samhaal naming.

### 3. Conversational search was undersold

The chat feature was hidden behind the name “Reference Desk” even though natural-language retrieval is one of the product’s strongest differentiators.

**Changed in this beta:** the second primary tab is **Ask**, with “Ask your memory”, example questions, and a persistent conversational composer.

### 4. Auto-detection relied on a raw filesystem path

The screenshot watcher queried `MediaStore.Images.Media.DATA` and passed a local path into JS. Raw paths are fragile with modern Android scoped storage.

**Changed in this beta:** the watcher passes the MediaStore `content://` URI into the on-device OCR flow.

### 5. Auto-save permission flow was incomplete

The original toggle checked overlay permission but did not explicitly make sure the app had media-library permission before querying MediaStore.

**Changed in this beta:** the toggle requests media permission first, then overlay permission.

## Backend mismatch to fix next

The privacy-first backend route stores screenshot records without a cloud `image_url`, which is correct for raw-image privacy. However, the current backend chat implementation only returns `sources` when it can create a signed screenshot URL. This means privacy-mode memories can answer chat questions but may not return source citation cards.

Recommended backend change:

- Make `ChatSource.image_url` optional.
- Return the used memory as a source even when there is no cloud screenshot image.
- Include `memory_id`, `screenshot_id`, `item_name`, and `extracted_text` for privacy-mode citations.
- The mobile app can later map `screenshot_id` to a local `content://` URI if you want to show the original screenshot without uploading it.

## Product recommendation for the beta

Keep the Android MVP deliberately small:

1. **Memories** — import/share screenshot, optional auto-save, local text search, intent filters.
2. **Ask** — natural-language search across saved memories.
3. Account/profile actions can stay lightweight until usage validates the core loop.

Avoid adding pricing, social features, folders, manual tagging, or complex settings before validating screenshot-save -> retrieve-later behavior.

## Play Store readiness items before production

- Review the optional overlay + special-use foreground service against current Google Play policy and declare the use case correctly.
- Add account deletion/privacy controls before public production if users can create accounts.
- Add production crash reporting and analytics around save success, OCR failure, memory retrieval, and Ask usage.
- Add Devanagari OCR before claiming Hindi screenshot OCR in the Android app.

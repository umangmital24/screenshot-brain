# Samhaal authentication email branding

The production Samhaal website is **https://samhaal.vercel.app**.

## Magic-link sign-in email

**Subject:** `Your Samhaal sign-in link ✦`

**HTML body:** [magic-link.html](./magic-link.html)

This template mirrors Samhaal Web's near-black and white aesthetic, uses the official
leaf logo, and includes the message that original screenshots remain on Android.

### Apply to hosted Supabase

1. Deploy the latest `feature/samhaal-landing-seo` branch to Vercel first.
   The email logo is hosted at `https://samhaal.vercel.app/samhaal-logo.png`
   (a PNG rather than an SVG because many email clients do not display SVGs).
2. Open the [Samhaal Supabase Auth templates dashboard](https://supabase.com/dashboard/project/yekvlxbxdtksexnhilan/auth/templates).
3. Choose the **Magic Link** email template, which handles email-link sign-in from
   the Samhaal login page.
4. Change the **Subject** to `Your Samhaal sign-in link ✦`.
5. Replace the template's **Body** with the entire contents of
   [magic-link.html](./magic-link.html), and **Save**.
6. In Supabase **Authentication → URL Configuration**, verify that the Site URL is
   `https://samhaal.vercel.app` and the redirect allowlist contains
   `https://samhaal.vercel.app/auth/callback`.
7. From `https://samhaal.vercel.app/login`, request a **fresh** sign-in email with
   an existing Samhaal account, then test the button and fallback link. Auth
   links are single-use. Check mobile and desktop email clients.

Keep `{{ .ConfirmationURL }}` unchanged in both CTA links: Supabase inserts
each user's short-lived, single-use authentication URL. The same applies to
`{{ .Email }}` in the footer. Do **not** replace ConfirmationURL with the
website homepage or a hardcoded login URL.

### Changing the sender name

Replacing the HTML controls the email **subject and body**, but **does not**
replace the sender name `Supabase Auth` or its default
`noreply@mail.app.supabase.io` address.

To send from a branded address (for example, `Samhaal <no-reply@your-owned-domain>`)
configure **Authentication → SMTP Settings** with a verified custom sending
domain and an SMTP provider such as Resend, Postmark, or Amazon SES. Follow
the provider's instructions for SPF/DKIM (and ideally DMARC). A domain must
be owned/verified before using its sender address. Never place SMTP credentials
in Vite frontend environment variables or GitHub.

Supabase's built-in email service is mainly for testing and has restrictions
and rate limits; use custom SMTP for production email delivery.

### Change management

Updating this file in GitHub **does not automatically update the active Supabase
email template**. Our currently connected Supabase management actions do not
offer hosted Auth template configuration updates. Re-paste the HTML after
future edits, or automate it separately using the Supabase Management API
with a properly protected project-management token.

Sources:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp

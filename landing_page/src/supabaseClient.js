import { createClient } from '@supabase/supabase-js'

// These are the SAME public Supabase project credentials used by the Android
// client on main (android_app/src/supabaseClient.js). Publishable keys are
// designed to be used in browser/mobile clients; never use service_role here.
const ANDROID_SUPABASE_URL = 'https://yekvlxbxdtksexnhilan.supabase.co'
const ANDROID_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_E6wBZ-N1SQ3a7a9uTXBNpg_VCA82853'

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

// Environment variables can override the defaults for previews or migrations.
// Missing example placeholders should not break login on the deployed website.
const supabaseUrl = configuredUrl && !configuredUrl.includes('your-project.supabase.co')
  ? configuredUrl
  : ANDROID_SUPABASE_URL
const supabaseAnonKey = configuredKey && !/xxxxx|YOUR_|your_/i.test(configuredKey)
  ? configuredKey
  : ANDROID_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
})

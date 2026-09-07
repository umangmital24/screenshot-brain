import { useEffect, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useShareIntentContext } from 'expo-share-intent'
import { supabase } from './supabaseClient'
import { uploadScreenshot } from './api'
import { colors } from './theme'

/**
 * Mount once near the app root (inside NavigationContainer is fine, or above it).
 * Watches for an incoming Android share (screenshot shared into the app) and
 * processes it automatically through the privacy-first /screenshot/metadata pipeline —
 * no navigation, no manual picker step.
 */
export default function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext()
  const [status, setStatus] = useState(null) // null | 'processing' | 'done' | 'error'
  const [message, setMessage] = useState('')
  const processingRef = useRef(false)

  useEffect(() => {
    if (!hasShareIntent || processingRef.current) return
    processFile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent])

  async function processFile() {
    processingRef.current = true
    setStatus('processing')
    setMessage('Reading screenshot on-device…')

    try {
      const file = shareIntent?.files?.[0]
      if (!file?.path) throw new Error('No image found in share')

      // Make sure we have a live session before uploading. If the user's
      // session expired, bail out quietly rather than throwing a confusing
      // network error — they'll see it queued next time they open the app.
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setStatus('error')
        setMessage('Sign in to save screenshots to Samhaal')
        return
      }

      const result = await uploadScreenshot({ uri: file.path })
      setStatus('done')
      setMessage(
        `Saved under "${result.intent || 'Uncategorized'}" — ${result.memories?.length ?? 0} item(s)`
      )
    } catch (err) {
      setStatus('error')
      setMessage(err.message || 'Could not save that screenshot')
    } finally {
      processingRef.current = false
      resetShareIntent()
      // Auto-dismiss the toast after a moment
      setTimeout(() => setStatus(null), 2500)
    }
  }

  if (!status) return null

  return (
    <View style={styles.toast} pointerEvents="none">
      {status === 'processing' && <ActivityIndicator size="small" color={colors.brass} />}
      <Text style={styles.text} numberOfLines={2}>
        {status === 'processing' ? message : message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 999,
    elevation: 10,
  },
  text: { color: colors.textPage, fontSize: 13, flex: 1 },
})
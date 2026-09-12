import { useEffect, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useShareIntentContext } from 'expo-share-intent'
import { supabase } from './supabaseClient'
import { uploadScreenshot } from './api'
import { colors } from './theme'

/**
 * Handles screenshots shared into Samhaal. OCR runs locally and the extracted
 * text is queued through the same async /captures pipeline as Save Bubble.
 */
export default function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext()
  const [status, setStatus] = useState(null)
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

      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setStatus('error')
        setMessage('Sign in to save screenshots to Samhaal')
        return
      }

      const result = await uploadScreenshot({ uri: file.path, appSource: 'android_share_sheet' })
      setStatus('done')

      if (result.status === 'completed') {
        const count = result.memories?.length ?? 0
        const first = result.memories?.[0]
        setMessage(first?.intent ? `Saved to ${first.intent.replaceAll('_', ' ')} · ${count} item(s)` : `Saved · ${count} item(s)`)
      } else {
        setMessage('Saved. Samhaal is finishing this memory in the background.')
      }
    } catch (err) {
      setStatus('error')
      setMessage(err.message || 'Could not save that screenshot')
    } finally {
      processingRef.current = false
      resetShareIntent()
      setTimeout(() => setStatus(null), 3000)
    }
  }

  if (!status) return null

  return (
    <View style={styles.toast} pointerEvents="none">
      {status === 'processing' && <ActivityIndicator size="small" color={colors.brass} />}
      <Text style={styles.text} numberOfLines={2}>{message}</Text>
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

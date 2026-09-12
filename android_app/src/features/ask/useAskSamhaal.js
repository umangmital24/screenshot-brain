import { useRef, useState } from 'react'
import { askChat, fetchMemories } from '../../api'
import { attachLocalMedia, attachLocalMediaToSources } from '../../localMemoryMedia'
import { ensureVisualIndexes } from '../../visualIndex'

export function cleanAssistantText(value) {
  if (!value) return ''
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function useAskSamhaal() {
  const [question, setQuestion] = useState('')
  const [log, setLog] = useState([])
  const [asking, setAsking] = useState(false)
  const listRef = useRef(null)

  async function prepareVisualSearch() {
    try {
      const memoryData = await fetchMemories()
      const withLocalMedia = await attachLocalMedia(memoryData.memories || [])
      await ensureVisualIndexes(withLocalMedia, 24)
    } catch (error) {
      console.warn('Visual search indexing skipped:', error?.message || error)
    }
  }

  function recentConversationHistory() {
    return log
      .filter((item) => (item.type === 'user' || item.type === 'assistant') && !item.error && item.text)
      .slice(-10)
      .map((item) => ({ role: item.type === 'user' ? 'user' : 'assistant', text: item.text }))
  }

  async function ask(prefilled) {
    const q = (typeof prefilled === 'string' ? prefilled : question).trim()
    if (!q || asking) return
    const history = recentConversationHistory()
    setQuestion('')
    setAsking(true)
    setLog((prev) => [...prev, { type: 'user', text: q }])

    try {
      await prepareVisualSearch()
      const data = await askChat(q, history)
      const sourcesWithLocalMedia = await attachLocalMediaToSources(data.sources || [])
      setLog((prev) => [...prev, {
        type: 'assistant',
        text: cleanAssistantText(data.answer),
        sources: sourcesWithLocalMedia,
      }])
    } catch (err) {
      setLog((prev) => [...prev, {
        type: 'assistant',
        text: `I couldn't search your memories right now. ${err.message}`,
        sources: [],
        error: true,
      }])
    } finally {
      setAsking(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)
    }
  }

  return { question, setQuestion, log, asking, listRef, ask }
}

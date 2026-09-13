// Samhaal mobile design system — the app itself stays deliberately monochrome.
// Marketing artwork may use accent shapes, but in-product UI is black, white and neutral gray.
export const colors = {
  canvas: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F7F8',
  surfaceActive: '#F1F1F2',
  text: '#09090B',
  textSecondary: '#5F6068',
  textMuted: '#7C7D86',
  textFaint: '#A8A9B0',
  border: 'rgba(9,9,11,0.14)',
  borderSubtle: 'rgba(9,9,11,0.08)',
  black: '#09090B',
  white: '#FFFFFF',
  success: '#09090B',
  danger: '#DC2626',

  // Backwards-compatible aliases used by native/legacy components.
  ink: '#FFFFFF',
  inkDeep: '#09090B',
  inkRaised: '#F7F7F8',
  cardStock: '#FFFFFF',
  cardStockShadow: '#F4F4F5',
  brass: '#09090B',
  brassBright: '#27272A',
  teal: '#09090B',
  tealBright: '#27272A',
  textPage: '#09090B',
  textPageDim: '#7C7D86',
  textCard: '#09090B',
  textCardDim: '#7C7D86',
}

export const intentMeta = {
  READ_LATER: { label: 'Read', code: 'READ' },
  WATCH_LATER: { label: 'Watch', code: 'WATCH' },
  BUY_LATER: { label: 'Buy', code: 'BUY' },
  COOK_LATER: { label: 'Cook', code: 'COOK' },
  VISIT_LATER: { label: 'Visit', code: 'VISIT' },
  LEARN_LATER: { label: 'Learn', code: 'LEARN' },
  APPLY_LATER: { label: 'Apply', code: 'APPLY' },
  TRY_LATER: { label: 'Try', code: 'TRY' },
}

export function intentLabel(intent) {
  return intentMeta[intent]?.label ?? intent
}

export function intentCode(intent) {
  return intentMeta[intent]?.code ?? intent?.slice(0, 8) ?? 'SAVED'
}

export function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Samhaal mobile design system — mirrors the landing page: white canvas,
// deep black type, architectural 1px borders and restrained motion/accent.
export const colors = {
  canvas: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceActive: '#F1F5F9',
  text: '#09090B',
  textSecondary: '#52525B',
  textMuted: '#71717A',
  textFaint: '#A1A1AA',
  border: 'rgba(0,0,0,0.10)',
  borderSubtle: 'rgba(0,0,0,0.06)',
  black: '#09090B',
  white: '#FFFFFF',
  success: '#16A34A',
  danger: '#DC2626',

  // Backwards-compatible aliases used by a few native/legacy components.
  ink: '#FFFFFF',
  inkDeep: '#09090B',
  inkRaised: '#F8FAFC',
  cardStock: '#FFFFFF',
  cardStockShadow: '#F4F4F5',
  brass: '#09090B',
  brassBright: '#27272A',
  teal: '#09090B',
  tealBright: '#27272A',
  textPage: '#09090B',
  textPageDim: '#71717A',
  textCard: '#09090B',
  textCardDim: '#71717A',
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

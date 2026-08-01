/** Stable pastel avatar colors (Telegram-style). */
const PALETTE = [
  '#e17076',
  '#7bc862',
  '#e5ca77',
  '#65aadd',
  '#a695e7',
  '#ee7aae',
  '#6ec9cb',
  '#faa774',
]

export function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s_]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

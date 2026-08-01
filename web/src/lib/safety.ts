/** Local trust store for peer public-key safety numbers. */

type TrustEntry = {
  publicKey: string
  verifiedAt: number
}

function key(username: string, peer: string) {
  return `chatapp:trust:${username.toLowerCase()}:${peer.toLowerCase()}`
}

export function getTrustedKey(me: string, peer: string): TrustEntry | null {
  try {
    const raw = localStorage.getItem(key(me, peer))
    if (!raw) return null
    return JSON.parse(raw) as TrustEntry
  } catch {
    return null
  }
}

export function markVerified(me: string, peer: string, publicKey: string) {
  const entry: TrustEntry = { publicKey, verifiedAt: Date.now() }
  localStorage.setItem(key(me, peer), JSON.stringify(entry))
}

export function clearTrust(me: string, peer: string) {
  localStorage.removeItem(key(me, peer))
}

export type TrustStatus = 'unverified' | 'verified' | 'changed'

export function trustStatus(me: string, peer: string, currentPublicKey: string): TrustStatus {
  const trusted = getTrustedKey(me, peer)
  if (!trusted) return 'unverified'
  if (trusted.publicKey !== currentPublicKey) return 'changed'
  return 'verified'
}

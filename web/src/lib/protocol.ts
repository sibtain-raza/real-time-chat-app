export type UserInfo = {
  username: string
  publicKey: string
  online: boolean
}

export type CallSignal = {
  sdp?: string
  type?: RTCSdpType
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
}

export type Packet = {
  type:
    | 'message'
    | 'voice'
    | 'setting'
    | 'users'
    | 'error'
    | 'call-offer'
    | 'call-answer'
    | 'call-ice'
    | 'call-hangup'
  from?: string
  to?: string
  publicKey?: string
  message?: string
  selfCopy?: string
  voice?: 'on' | 'off'
  users?: UserInfo[]
  error?: string
  signal?: CallSignal
}

export type StoredMessage = {
  id: number
  peer: string
  from: string
  ciphertext: string
  senderPublicKey: string
  createdAt: number
}

export type ICEServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

/** Normalize an optional override host. Empty → same-origin. */
export function normalizeHost(host?: string): string {
  return (host ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/**
 * If the page is served from a public host but the user typed localhost
 * (common when copying the placeholder), ignore the override so auth/WS
 * stay on the page origin.
 */
export function resolveHost(host?: string): string {
  const h = normalizeHost(host)
  if (!h) return ''
  const pageHost = typeof window !== 'undefined' ? window.location.hostname : ''
  const isLocalOverride =
    h === 'localhost' ||
    h.startsWith('localhost:') ||
    h === '127.0.0.1' ||
    h.startsWith('127.0.0.1:')
  const pageIsRemote =
    pageHost !== '' && pageHost !== 'localhost' && pageHost !== '127.0.0.1'
  if (isLocalOverride && pageIsRemote) return ''
  return h
}

export function apiURL(path: string, host?: string): string {
  const h = resolveHost(host)
  if (h) {
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${proto}//${h}${path}`
  }
  return path
}

export function wsURL(host?: string): string {
  const h = resolveHost(host)
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  if (h) return `${proto}//${h}/ws`
  return `${proto}//${window.location.host}/ws`
}

export function networkErrorMessage(err: unknown, action: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/failed to fetch|networkerror|load failed|fetch/i.test(raw)) {
    return `Could not reach the server (${action}). Leave Server blank when using this site’s URL.`
  }
  return raw || `${action} failed`
}

export function isCallPacket(type: Packet['type']): boolean {
  return (
    type === 'call-offer' ||
    type === 'call-answer' ||
    type === 'call-ice' ||
    type === 'call-hangup'
  )
}

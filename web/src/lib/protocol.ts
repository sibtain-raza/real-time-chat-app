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
  voice?: 'on' | 'off'
  users?: UserInfo[]
  error?: string
  signal?: CallSignal
}

export function apiURL(path: string, host?: string): string {
  if (host?.trim()) {
    const h = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${proto}//${h}${path}`
  }
  return path
}

export function wsURL(host?: string): string {
  if (host?.trim()) {
    const h = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${h}/ws`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

export function isCallPacket(type: Packet['type']): boolean {
  return (
    type === 'call-offer' ||
    type === 'call-answer' ||
    type === 'call-ice' ||
    type === 'call-hangup'
  )
}

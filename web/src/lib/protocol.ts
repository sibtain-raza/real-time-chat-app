export type Handshake = {
  name: string
  key: string
}

export type Packet = {
  type: 'message' | 'voice' | 'setting'
  name?: string
  message?: string
  voice?: 'on' | 'off'
}

export function wsURL(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

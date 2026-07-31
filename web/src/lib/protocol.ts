export type Handshake = {
  name: string
  publicKey: string
}

export type Peer = {
  name: string
  publicKey: string
}

export type Envelope = {
  to: string
  message: string
}

export type Packet = {
  type: 'message' | 'voice' | 'setting' | 'peers'
  name?: string
  publicKey?: string
  message?: string
  voice?: 'on' | 'off'
  envelopes?: Envelope[]
  peers?: Peer[]
}

export function wsURL(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

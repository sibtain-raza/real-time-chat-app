import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createIdentity,
  decryptFrom,
  decryptTextFrom,
  encryptFor,
  encryptTextFor,
  fingerprint,
  type Identity,
} from '../lib/crypto'
import { type Envelope, type Packet, type Peer, wsURL } from '../lib/protocol'
import { VoiceSession } from '../lib/voice'

export type ChatMessage = {
  id: string
  from: string
  text: string
  at: string
  self?: boolean
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

export function useChat() {
  const [status, setStatus] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [peers, setPeers] = useState<Peer[]>([])
  const [micOn, setMicOn] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [keyPrint, setKeyPrint] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const identityRef = useRef<Identity | null>(null)
  const peersRef = useRef<Peer[]>([])
  const nameRef = useRef('')
  const voiceRef = useRef(new VoiceSession())

  const append = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: `${Date.now()}-${Math.random()}` }])
  }, [])

  const disconnect = useCallback(() => {
    voiceRef.current.dispose()
    voiceRef.current = new VoiceSession()
    setMicOn(false)
    setSpeakerOn(false)
    wsRef.current?.close()
    wsRef.current = null
    identityRef.current = null
    peersRef.current = []
    setPeers([])
    setKeyPrint(null)
    setStatus('idle')
  }, [])

  const connect = useCallback(
    async (host: string, name: string) => {
      setError(null)
      setStatus('connecting')
      setMessages([])
      nameRef.current = name

      const identity = await createIdentity()
      identityRef.current = identity
      setKeyPrint(fingerprint(identity.publicKeyB64))

      const url = host.trim()
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}/ws`
        : wsURL()

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              name,
              publicKey: identity.publicKeyB64,
            }),
          )
          setStatus('connected')
          append({
            from: 'system',
            text: `Joined as ${name} · key ${fingerprint(identity.publicKeyB64)}`,
            at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          })
          resolve()
        }

        ws.onerror = () => {
          setStatus('error')
          setError('Could not reach the chat server.')
          reject(new Error('websocket error'))
        }

        ws.onclose = () => {
          voiceRef.current.dispose()
          voiceRef.current = new VoiceSession()
          setMicOn(false)
          setSpeakerOn(false)
          setStatus((s) => (s === 'connecting' ? 'error' : 'idle'))
        }

        ws.onmessage = async (ev) => {
          try {
            const pkt = JSON.parse(String(ev.data)) as Packet
            const me = identityRef.current
            if (!me) return

            if (pkt.type === 'peers' && pkt.peers) {
              peersRef.current = pkt.peers
              setPeers(pkt.peers)
              return
            }

            if (pkt.type === 'message' && pkt.message && pkt.publicKey) {
              const text = await decryptTextFrom(me.privateKey, pkt.publicKey, pkt.message)
              append({
                from: pkt.name || 'unknown',
                text,
                at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              })
              return
            }

            if (pkt.type === 'voice' && pkt.message && pkt.publicKey) {
              const pcm = await decryptFrom(me.privateKey, pkt.publicKey, pkt.message)
              await voiceRef.current.playPCM(pcm)
            }
          } catch {
            // ignore decrypt/parse errors
          }
        }
      })
    },
    [append],
  )

  const buildEnvelopes = useCallback(async (plain: Uint8Array): Promise<Envelope[]> => {
    const me = identityRef.current
    if (!me) return []
    const others = peersRef.current.filter((p) => p.publicKey !== me.publicKeyB64)
    const envelopes: Envelope[] = []
    for (const peer of others) {
      const message = await encryptFor(me.privateKey, peer.publicKey, plain)
      envelopes.push({ to: peer.publicKey, message })
    }
    return envelopes
  }, [])

  const sendText = useCallback(
    async (text: string) => {
      const ws = wsRef.current
      const me = identityRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || !me) return

      const others = peersRef.current.filter((p) => p.publicKey !== me.publicKeyB64)
      if (others.length === 0) {
        append({
          from: 'system',
          text: 'No other peers online yet — message kept local.',
          at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        })
      }

      const envelopes: Envelope[] = []
      for (const peer of others) {
        const message = await encryptTextFor(me.privateKey, peer.publicKey, text)
        envelopes.push({ to: peer.publicKey, message })
      }

      const pkt: Packet = { type: 'message', envelopes }
      ws.send(JSON.stringify(pkt))
      append({
        from: 'You',
        text,
        at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        self: true,
      })
    },
    [append],
  )

  const sendSetting = useCallback((voice: 'on' | 'off') => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const pkt: Packet = { type: 'setting', voice }
    ws.send(JSON.stringify(pkt))
  }, [])

  const toggleSpeaker = useCallback(async () => {
    if (speakerOn) {
      voiceRef.current.stopSpeaker()
      sendSetting('off')
      setSpeakerOn(false)
      return
    }
    await voiceRef.current.startSpeaker()
    sendSetting('on')
    setSpeakerOn(true)
  }, [sendSetting, speakerOn])

  const toggleMic = useCallback(async () => {
    if (micOn) {
      voiceRef.current.stopMic()
      setMicOn(false)
      return
    }
    await voiceRef.current.startMic(async (pcm) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const envelopes = await buildEnvelopes(pcm)
      if (envelopes.length === 0) return
      const pkt: Packet = { type: 'voice', envelopes }
      ws.send(JSON.stringify(pkt))
    })
    setMicOn(true)
  }, [buildEnvelopes, micOn])

  useEffect(() => () => disconnect(), [disconnect])

  const otherPeers = peers.filter(
    (p) => p.publicKey !== identityRef.current?.publicKeyB64,
  )

  return {
    status,
    error,
    messages,
    peers: otherPeers,
    keyPrint,
    micOn,
    speakerOn,
    connect,
    disconnect,
    sendText,
    toggleMic,
    toggleSpeaker,
  }
}

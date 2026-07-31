import { useCallback, useEffect, useRef, useState } from 'react'
import { decryptBytes, decryptText, encryptBytes, encryptText } from '../lib/crypto'
import { type Packet, wsURL } from '../lib/protocol'
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
  const [micOn, setMicOn] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const keyRef = useRef('')
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
    setStatus('idle')
  }, [])

  const connect = useCallback(
    async (host: string, name: string, key: string) => {
      setError(null)
      setStatus('connecting')
      keyRef.current = key
      nameRef.current = name

      const url = host.trim()
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}/ws`
        : wsURL()

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          ws.send(JSON.stringify({ name, key }))
          setStatus('connected')
          append({
            from: 'system',
            text: `Joined as ${name}`,
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
            if (pkt.type === 'message' && pkt.message) {
              const text = await decryptText(pkt.message, keyRef.current)
              append({
                from: pkt.name || 'unknown',
                text,
                at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              })
            } else if (pkt.type === 'voice' && pkt.message) {
              const pcm = await decryptBytes(pkt.message, keyRef.current)
              await voiceRef.current.playPCM(pcm)
            }
          } catch {
            // ignore decrypt/parse errors from mismatched keys or bad frames
          }
        }
      })
    },
    [append],
  )

  const sendText = useCallback(
    async (text: string) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const message = await encryptText(text, keyRef.current)
      const pkt: Packet = { type: 'message', message }
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
      const message = await encryptBytes(pcm, keyRef.current)
      const pkt: Packet = { type: 'voice', message }
      ws.send(JSON.stringify(pkt))
    })
    setMicOn(true)
  }, [micOn])

  useEffect(() => () => disconnect(), [disconnect])

  return {
    status,
    error,
    messages,
    micOn,
    speakerOn,
    connect,
    disconnect,
    sendText,
    toggleMic,
    toggleSpeaker,
  }
}

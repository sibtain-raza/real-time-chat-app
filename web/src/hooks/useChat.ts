import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decryptFrom,
  decryptTextFrom,
  encryptFor,
  encryptTextFor,
  fingerprint,
  loadOrCreateIdentity,
  type Identity,
} from '../lib/crypto'
import { apiURL, type Packet, type UserInfo, wsURL } from '../lib/protocol'
import { VoiceSession } from '../lib/voice'

export type ChatMessage = {
  id: string
  from: string
  text: string
  at: string
  self?: boolean
  system?: boolean
}

export type AuthSession = {
  token: string
  username: string
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error'

const SESSION_KEY = 'chatapp:session'

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

function saveSession(s: AuthSession | null) {
  if (!s) localStorage.removeItem(SESSION_KEY)
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

export function useChat() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession())
  const [authError, setAuthError] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [activePeer, setActivePeer] = useState<string | null>(null)
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({})
  const [micOn, setMicOn] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [keyPrint, setKeyPrint] = useState<string | null>(null)
  const [host, setHost] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const identityRef = useRef<Identity | null>(null)
  const usersRef = useRef<UserInfo[]>([])
  const activePeerRef = useRef<string | null>(null)
  const voiceRef = useRef(new VoiceSession())
  const hostRef = useRef('')

  useEffect(() => {
    activePeerRef.current = activePeer
  }, [activePeer])

  const appendTo = useCallback((peer: string, msg: Omit<ChatMessage, 'id'>) => {
    setThreads((prev) => {
      const list = prev[peer] ?? []
      return {
        ...prev,
        [peer]: [...list, { ...msg, id: `${Date.now()}-${Math.random()}` }],
      }
    })
  }, [])

  const disconnectSocket = useCallback(() => {
    voiceRef.current.dispose()
    voiceRef.current = new VoiceSession()
    setMicOn(false)
    setSpeakerOn(false)
    wsRef.current?.close()
    wsRef.current = null
    identityRef.current = null
    setKeyPrint(null)
    setStatus('idle')
  }, [])

  const logout = useCallback(() => {
    disconnectSocket()
    saveSession(null)
    setSession(null)
    setUsers([])
    setActivePeer(null)
    setThreads({})
    setAuthError(null)
  }, [disconnectSocket])

  const authRequest = useCallback(
    async (mode: 'signup' | 'login', username: string, password: string, serverHost: string) => {
      setAuthError(null)
      setHost(serverHost)
      hostRef.current = serverHost
      const res = await fetch(apiURL(`/api/${mode}`, serverHost), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = (await res.json()) as { token?: string; username?: string; error?: string }
      if (!res.ok || !data.token || !data.username) {
        throw new Error(data.error || `${mode} failed`)
      }
      const next = { token: data.token, username: data.username }
      saveSession(next)
      setSession(next)
      return next
    },
    [],
  )

  const signup = useCallback(
    (username: string, password: string, serverHost = '') =>
      authRequest('signup', username, password, serverHost),
    [authRequest],
  )

  const login = useCallback(
    (username: string, password: string, serverHost = '') =>
      authRequest('login', username, password, serverHost),
    [authRequest],
  )

  const connect = useCallback(
    async (sess: AuthSession, serverHost = hostRef.current) => {
      setError(null)
      setStatus('connecting')
      hostRef.current = serverHost

      const identity = await loadOrCreateIdentity(sess.username)
      identityRef.current = identity
      setKeyPrint(fingerprint(identity.publicKeyB64))

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsURL(serverHost))
        wsRef.current = ws

        ws.onopen = () => {
          ws.send(JSON.stringify({ token: sess.token, publicKey: identity.publicKeyB64 }))
          setStatus('connected')
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

            if (pkt.type === 'users' && pkt.users) {
              const others = pkt.users.filter((u) => u.username !== sess.username)
              usersRef.current = others
              setUsers(others)
              return
            }

            if (pkt.type === 'error' && pkt.error) {
              setError(pkt.error)
              return
            }

            if (pkt.type === 'message' && pkt.message && pkt.publicKey && pkt.from) {
              const text = await decryptTextFrom(me.privateKey, pkt.publicKey, pkt.message)
              appendTo(pkt.from, {
                from: pkt.from,
                text,
                at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              })
              if (!activePeerRef.current) setActivePeer(pkt.from)
              return
            }

            if (pkt.type === 'voice' && pkt.message && pkt.publicKey && pkt.from) {
              const pcm = await decryptFrom(me.privateKey, pkt.publicKey, pkt.message)
              await voiceRef.current.playPCM(pcm)
            }
          } catch {
            // ignore
          }
        }
      })
    },
    [appendTo],
  )

  // Auto-connect after login/signup when session exists
  useEffect(() => {
    if (!session) return
    if (status === 'connected' || status === 'connecting') return
    void connect(session, host).catch(() => {
      setAuthError('Session expired or server unreachable. Please log in again.')
      logout()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const sendText = useCallback(
    async (text: string) => {
      const ws = wsRef.current
      const me = identityRef.current
      const peerName = activePeerRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || !me || !peerName) return

      const peer = usersRef.current.find((u) => u.username === peerName)
      if (!peer?.online || !peer.publicKey) {
        setError(`${peerName} is offline`)
        return
      }

      const message = await encryptTextFor(me.privateKey, peer.publicKey, text)
      const pkt: Packet = { type: 'message', to: peerName, message }
      ws.send(JSON.stringify(pkt))
      appendTo(peerName, {
        from: 'You',
        text,
        at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        self: true,
      })
    },
    [appendTo],
  )

  const sendSetting = useCallback((voice: 'on' | 'off') => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'setting', voice } satisfies Packet))
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
      const me = identityRef.current
      const peerName = activePeerRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || !me || !peerName) return
      const peer = usersRef.current.find((u) => u.username === peerName)
      if (!peer?.online || !peer.publicKey) return
      const message = await encryptFor(me.privateKey, peer.publicKey, pcm)
      ws.send(JSON.stringify({ type: 'voice', to: peerName, message } satisfies Packet))
    })
    setMicOn(true)
  }, [micOn])

  useEffect(() => () => disconnectSocket(), [disconnectSocket])

  const messages = activePeer ? threads[activePeer] ?? [] : []

  return {
    session,
    authError,
    setAuthError,
    status,
    error,
    setError,
    users,
    activePeer,
    setActivePeer,
    messages,
    keyPrint,
    micOn,
    speakerOn,
    host,
    setHost,
    signup,
    login,
    logout,
    sendText,
    toggleMic,
    toggleSpeaker,
  }
}

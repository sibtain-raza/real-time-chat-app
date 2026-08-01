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
import {
  apiURL,
  isCallPacket,
  networkErrorMessage,
  resolveHost,
  type Packet,
  type StoredMessage,
  type UserInfo,
  wsURL,
} from '../lib/protocol'
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

function formatAt(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
  const [historyLoading, setHistoryLoading] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const identityRef = useRef<Identity | null>(null)
  const usersRef = useRef<UserInfo[]>([])
  const activePeerRef = useRef<string | null>(null)
  const voiceRef = useRef(new VoiceSession())
  const hostRef = useRef('')
  const callHandlerRef = useRef<((pkt: Packet) => void) | null>(null)
  const sessionRef = useRef<AuthSession | null>(session)
  const loadedHistoryRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    activePeerRef.current = activePeer
  }, [activePeer])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const appendTo = useCallback((peer: string, msg: Omit<ChatMessage, 'id'>) => {
    setThreads((prev) => {
      const list = prev[peer] ?? []
      return {
        ...prev,
        [peer]: [...list, { ...msg, id: `${Date.now()}-${Math.random()}` }],
      }
    })
  }, [])

  const setCallHandler = useCallback((handler: ((pkt: Packet) => void) | null) => {
    callHandlerRef.current = handler
  }, [])

  const sendPacket = useCallback((pkt: Packet) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(pkt))
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

  const logout = useCallback(async () => {
    const sess = sessionRef.current
    if (sess) {
      try {
        await fetch(apiURL('/api/logout', hostRef.current), {
          method: 'POST',
          headers: { Authorization: `Bearer ${sess.token}` },
        })
      } catch {
        // ignore network errors on logout
      }
    }
    disconnectSocket()
    saveSession(null)
    setSession(null)
    setUsers([])
    setActivePeer(null)
    setThreads({})
    loadedHistoryRef.current.clear()
    setAuthError(null)
  }, [disconnectSocket])

  const authRequest = useCallback(
    async (mode: 'signup' | 'login', username: string, password: string, serverHost: string) => {
      setAuthError(null)
      const resolved = resolveHost(serverHost)
      setHost(resolved)
      hostRef.current = resolved
      let res: Response
      try {
        res = await fetch(apiURL(`/api/${mode}`, resolved), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
      } catch (err) {
        throw new Error(networkErrorMessage(err, mode))
      }
      let data: { token?: string; username?: string; error?: string }
      try {
        data = (await res.json()) as { token?: string; username?: string; error?: string }
      } catch {
        throw new Error(`${mode} failed: invalid server response`)
      }
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

  const loadHistory = useCallback(
    async (peer: string, sess: AuthSession, identity: Identity) => {
      if (loadedHistoryRef.current.has(peer)) return
      setHistoryLoading(true)
      try {
        const res = await fetch(apiURL(`/api/messages?peer=${encodeURIComponent(peer)}`, hostRef.current), {
          headers: { Authorization: `Bearer ${sess.token}` },
        })
        if (!res.ok) return
        const data = (await res.json()) as { messages?: StoredMessage[] }
        const rows = data.messages ?? []
        const decrypted: ChatMessage[] = []
        for (const row of rows) {
          try {
            const text = await decryptTextFrom(identity.privateKey, row.senderPublicKey, row.ciphertext)
            const self = row.from === sess.username
            decrypted.push({
              id: `hist-${row.id}`,
              from: self ? 'You' : row.from,
              text,
              at: formatAt(row.createdAt),
              self,
            })
          } catch {
            // skip undecryptable rows (key change)
          }
        }
        loadedHistoryRef.current.add(peer)
        setThreads((prev) => {
          const live = (prev[peer] ?? []).filter((m) => !m.id.startsWith('hist-'))
          return { ...prev, [peer]: [...decrypted, ...live] }
        })
      } finally {
        setHistoryLoading(false)
      }
    },
    [],
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
          setError(
            'Could not reach the chat server. Leave Server blank when using this site’s URL, then log in again.',
          )
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

            if (isCallPacket(pkt.type)) {
              callHandlerRef.current?.(pkt)
              return
            }

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

  useEffect(() => {
    if (!session) return
    if (status === 'connected' || status === 'connecting') return
    void connect(session, host).catch(() => {
      setAuthError('Session expired or server unreachable. Please log in again.')
      void logout()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  useEffect(() => {
    if (!session || !activePeer || status !== 'connected') return
    const identity = identityRef.current
    if (!identity) return
    void loadHistory(activePeer, session, identity)
  }, [activePeer, session, status, loadHistory])

  const sendText = useCallback(
    async (text: string) => {
      const ws = wsRef.current
      const me = identityRef.current
      const peerName = activePeerRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN || !me || !peerName) return

      const peer = usersRef.current.find((u) => u.username === peerName)
      if (!peer?.publicKey) {
        setError(`${peerName} has no public key yet`)
        return
      }

      const message = await encryptTextFor(me.privateKey, peer.publicKey, text)
      const selfCopy = await encryptTextFor(me.privateKey, me.publicKeyB64, text)
      const pkt: Packet = { type: 'message', to: peerName, message, selfCopy }
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

  const sendSetting = useCallback(
    (voice: 'on' | 'off') => {
      sendPacket({ type: 'setting', voice })
    },
    [sendPacket],
  )

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
      const me = identityRef.current
      const peerName = activePeerRef.current
      if (!me || !peerName) return
      const peer = usersRef.current.find((u) => u.username === peerName)
      if (!peer?.online || !peer.publicKey) return
      const message = await encryptFor(me.privateKey, peer.publicKey, pcm)
      sendPacket({ type: 'voice', to: peerName, message })
    })
    setMicOn(true)
  }, [micOn, sendPacket])

  useEffect(() => () => disconnectSocket(), [disconnectSocket])

  const messages = activePeer ? (threads[activePeer] ?? []) : []

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
    historyLoading,
    signup,
    login,
    logout,
    sendText,
    toggleMic,
    toggleSpeaker,
    sendPacket,
    setCallHandler,
  }
}

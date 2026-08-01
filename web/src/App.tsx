import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { VideoCall } from './components/VideoCall'
import { useChat } from './hooks/useChat'
import { useVideoCall } from './hooks/useVideoCall'
import { avatarColor, initials } from './lib/avatar'
import { fingerprint } from './lib/crypto'
import { clearTrust, markVerified, trustStatus } from './lib/safety'

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10v4h3l5 4V6l-5 4H4Z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="7" width="11" height="10" rx="1.5" />
      <path d="M14 10.5 20 7v10l-6-3.5" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.4 20.6 21 12 3.4 3.4l.1 6.8L15 12 3.5 13.8z" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2" />
      <path d="M15 12H3" />
      <path d="m6 9-3 3 3 3" />
    </svg>
  )
}

function Avatar({ name, online, size = 'md' }: { name: string; online?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`avatar avatar-${size}`} style={{ background: avatarColor(name) }} aria-hidden>
      {initials(name)}
      {online ? <span className="avatar-online" /> : null}
    </span>
  )
}

export default function App() {
  const {
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
  } = useChat()

  const call = useVideoCall({ sendPacket, setCallHandler, host })

  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [trustTick, setTrustTick] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activePeer])

  const activeUser = users.find((u) => u.username === activePeer)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.username.toLowerCase().includes(q))
  }, [users, query])

  const peerTrust = useMemo(() => {
    if (!session || !activePeer || !activeUser?.publicKey) return null
    void trustTick
    return {
      status: trustStatus(session.username, activePeer, activeUser.publicKey),
      print: fingerprint(activeUser.publicKey),
    }
  }, [session, activePeer, activeUser?.publicKey, trustTick])

  async function onAuth(e: FormEvent) {
    e.preventDefault()
    setAuthError(null)
    setBusy(true)
    try {
      if (mode === 'signup') await signup(username.trim(), password, host.trim())
      else await login(username.trim(), password, host.trim())
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !activePeer) return
    setDraft('')
    setError(null)
    await sendText(text)
  }

  const connected = Boolean(session) && status === 'connected'
  const canMessage = Boolean(activeUser?.publicKey)
  const chatOpen = Boolean(activePeer)

  if (!session) {
    return (
      <div className="app-shell gate-shell">
        <main className="gate">
          <div className="gate-inner">
            <div className="gate-logo" aria-hidden>
              <span className="gate-logo-mark">C</span>
            </div>
            <h1 className="brand">ChatApp</h1>
            <p className="tagline">Private 1:1 chat with your own keys — Telegram-simple.</p>

            <div className="mode-switch" role="tablist" aria-label="Auth mode">
              <button
                type="button"
                className={mode === 'signup' ? 'mode on' : 'mode'}
                onClick={() => setMode('signup')}
              >
                Sign up
              </button>
              <button
                type="button"
                className={mode === 'login' ? 'mode on' : 'mode'}
                onClick={() => setMode('login')}
              >
                Log in
              </button>
            </div>

            <form className="gate-form" onSubmit={onAuth}>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="letters, numbers, _"
                  required
                  minLength={3}
                  autoComplete="username"
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ chars with a letter and number"
                  required
                  minLength={8}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>
              <details className="advanced-host">
                <summary>Advanced: custom server</summary>
                <div className="field">
                  <label htmlFor="host">Server</label>
                  <input
                    id="host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="Leave blank (uses this site)"
                    autoComplete="off"
                  />
                </div>
              </details>
              <div className="cta-row">
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : mode === 'signup' ? 'Start messaging' : 'Log in'}
                </button>
              </div>
              {authError ? <p className="gate-error">{authError}</p> : null}
            </form>
          </div>
        </main>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="app-shell gate-shell">
        <main className="gate">
          <div className="gate-inner">
            <h1 className="brand">ChatApp</h1>
            <p className="tagline">
              {status === 'connecting'
                ? 'Connecting…'
                : status === 'error'
                  ? 'Could not connect to the chat server.'
                  : 'Reconnecting…'}
            </p>
            {error ? <p className="gate-error">{error}</p> : null}
            <button className="btn btn-ghost" type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <VideoCall
        phase={call.phase}
        peer={call.peer}
        muted={call.muted}
        cameraOff={call.cameraOff}
        callError={call.callError}
        onAccept={() => void call.acceptCall()}
        onReject={call.rejectCall}
        onHangup={call.hangup}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
        attachLocalVideo={call.attachLocalVideo}
        attachRemoteVideo={call.attachRemoteVideo}
      />
      <main className={`desk${chatOpen ? ' chat-open' : ''}`}>
        <aside className="sidebar">
          <header className="sidebar-head">
            <div className="sidebar-me">
              <Avatar name={session.username} online size="md" />
              <div className="sidebar-me-text">
                <h1 className="room-brand">ChatApp</h1>
                <p className="me-name">{session.username}</p>
              </div>
            </div>
            <button className="icon-btn" type="button" onClick={() => void logout()} title="Log out" aria-label="Log out">
              <LogoutIcon />
            </button>
          </header>

          <div className="search-bar">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search people"
            />
          </div>

          <ul className="user-list">
            {filtered.length === 0 ? (
              <li className="user-empty">
                {users.length === 0 ? 'No chats yet — invite someone to sign up.' : 'No matches.'}
              </li>
            ) : (
              filtered.map((u) => (
                <li key={u.username}>
                  <button
                    type="button"
                    className={`user-row${activePeer === u.username ? ' active' : ''}`}
                    onClick={() => {
                      setActivePeer(u.username)
                      setError(null)
                    }}
                  >
                    <Avatar name={u.username} online={u.online} />
                    <span className="user-meta">
                      <span className="user-name">{u.username}</span>
                      <span className="user-state">{u.online ? 'online' : 'offline'}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {keyPrint ? <p className="sidebar-key">Your key · {keyPrint}</p> : null}
        </aside>

        <section className="conversation">
          {activePeer ? (
            <>
              <header className="conv-top">
                <button
                  type="button"
                  className="icon-btn back-btn"
                  aria-label="Back to chats"
                  onClick={() => setActivePeer(null)}
                >
                  <BackIcon />
                </button>
                <Avatar name={activePeer} online={activeUser?.online} size="md" />
                <div className="conv-identity">
                  <h2 className="conv-title">{activePeer}</h2>
                  <p className="peer-line">
                    {activeUser?.online ? 'online' : 'offline'}
                    {historyLoading ? ' · loading…' : ''}
                    {peerTrust?.status === 'verified' ? ' · verified' : ''}
                    {peerTrust?.status === 'changed' ? ' · key changed' : ''}
                  </p>
                </div>
                <div className="media-toggles">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Start video call"
                    title="Video call"
                    disabled={!activeUser?.online || call.phase !== 'idle'}
                    onClick={() => void call.startCall(activePeer)}
                  >
                    <VideoIcon />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn${micOn ? ' on' : ''}`}
                    aria-pressed={micOn}
                    aria-label="Microphone"
                    onClick={() => void toggleMic()}
                    disabled={!activeUser?.online}
                  >
                    <MicIcon />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn${speakerOn ? ' on' : ''}`}
                    aria-pressed={speakerOn}
                    aria-label="Speaker"
                    onClick={() => void toggleSpeaker()}
                  >
                    <SpeakerIcon />
                  </button>
                </div>
              </header>

              {peerTrust && peerTrust.status !== 'verified' ? (
                <div className={`trust-banner ${peerTrust.status}`}>
                  <span>
                    Safety number <code>{peerTrust.print}</code>
                    {peerTrust.status === 'changed' ? ' — key changed' : ' — unverified'}
                  </span>
                  {activeUser?.publicKey ? (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        markVerified(session.username, activePeer, activeUser.publicKey)
                        setTrustTick((n) => n + 1)
                      }}
                    >
                      Mark verified
                    </button>
                  ) : null}
                </div>
              ) : peerTrust?.status === 'verified' ? (
                <div className="trust-banner verified">
                  <span>
                    Verified · <code>{peerTrust.print}</code>
                  </span>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      clearTrust(session.username, activePeer)
                      setTrustTick((n) => n + 1)
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : null}

              <div className="transcript" aria-live="polite">
                {messages.map((m) =>
                  m.system ? (
                    <div key={m.id} className="msg system">
                      <span>{m.text}</span>
                    </div>
                  ) : (
                    <article key={m.id} className={`bubble${m.self ? ' self' : ''}`}>
                      <div className="bubble-body">{m.text}</div>
                      <time className="bubble-time">{m.at}</time>
                    </article>
                  ),
                )}
                <div ref={endRef} />
              </div>

              {error ? <p className="inline-error">{error}</p> : null}
              {call.callError ? <p className="inline-error">{call.callError}</p> : null}

              <form className="composer" onSubmit={onSend}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={canMessage ? 'Message' : 'Waiting for their key…'}
                  aria-label="Message"
                  disabled={!canMessage}
                />
                <button
                  className="send-btn"
                  type="submit"
                  disabled={!canMessage || !draft.trim()}
                  aria-label="Send"
                >
                  <SendIcon />
                </button>
              </form>
            </>
          ) : (
            <div className="empty-conv">
              <div className="empty-illu" aria-hidden>
                <span className="gate-logo-mark">C</span>
              </div>
              <h2>ChatApp</h2>
              <p>Select a chat to start messaging.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

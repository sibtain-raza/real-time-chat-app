import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { VideoCall } from './components/VideoCall'
import { WavePlane } from './components/WavePlane'
import { useChat } from './hooks/useChat'
import { useVideoCall } from './hooks/useVideoCall'
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
  const [trustTick, setTrustTick] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activePeer])

  const activeUser = users.find((u) => u.username === activePeer)
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

  if (!session) {
    return (
      <div className="app-shell">
        <WavePlane />
        <main className="gate">
          <div className="gate-inner">
            <h1 className="brand">ChatApp</h1>
            <p className="tagline">Create an account, then talk one-to-one with private keys.</p>

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
                <label htmlFor="host">Server</label>
                <input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="localhost:9090 (blank if same host)"
                  autoComplete="off"
                />
              </div>
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
              <p className="key-note">
                After you {mode === 'signup' ? 'sign up' : 'log in'}, we create or restore your ECDH
                key pair. Prefer HTTPS in production for camera/mic and transport security.
              </p>
              <div className="cta-row">
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
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
      <div className="app-shell">
        <WavePlane />
        <main className="gate">
          <div className="gate-inner">
            <h1 className="brand">ChatApp</h1>
            <p className="tagline">
              {status === 'connecting' ? 'Connecting secure session…' : 'Reconnecting…'}
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
      <WavePlane />
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
      <main className="desk">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h1 className="room-brand">ChatApp</h1>
            <p className="key-print">
              {session.username}
              {keyPrint ? ` · ${keyPrint}` : ''}
            </p>
          </div>
          <p className="sidebar-label">People</p>
          <ul className="user-list">
            {users.length === 0 ? (
              <li className="user-empty">No other accounts yet. Invite someone to sign up.</li>
            ) : (
              users.map((u) => (
                <li key={u.username}>
                  <button
                    type="button"
                    className={`user-row${activePeer === u.username ? ' active' : ''}`}
                    onClick={() => {
                      setActivePeer(u.username)
                      setError(null)
                    }}
                  >
                    <span className={`presence${u.online ? ' on' : ''}`} />
                    <span className="user-name">{u.username}</span>
                    <span className="user-state">{u.online ? 'online' : 'offline'}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button className="btn btn-ghost logout" type="button" onClick={() => void logout()}>
            Log out
          </button>
        </aside>

        <section className="conversation">
          {activePeer ? (
            <>
              <header className="conv-top">
                <div>
                  <h2 className="conv-title">{activePeer}</h2>
                  <p className="peer-line">
                    {activeUser?.online ? 'Online' : 'Offline'} · end-to-end encrypted
                    {historyLoading ? ' · loading history…' : ''}
                  </p>
                  {peerTrust ? (
                    <div className={`trust-row ${peerTrust.status}`}>
                      <span>
                        Safety number · <code>{peerTrust.print}</code>
                        {peerTrust.status === 'verified'
                          ? ' · verified'
                          : peerTrust.status === 'changed'
                            ? ' · key changed!'
                            : ' · unverified'}
                      </span>
                      {peerTrust.status !== 'verified' && activeUser?.publicKey ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            markVerified(session.username, activePeer, activeUser.publicKey)
                            setTrustTick((n) => n + 1)
                          }}
                        >
                          Mark verified
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            clearTrust(session.username, activePeer)
                            setTrustTick((n) => n + 1)
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="media-toggles">
                  <button
                    type="button"
                    className="toggle"
                    aria-label="Start video call"
                    title="Video call"
                    disabled={!activeUser?.online || call.phase !== 'idle'}
                    onClick={() => void call.startCall(activePeer)}
                  >
                    <VideoIcon />
                  </button>
                  <button
                    type="button"
                    className={`toggle${micOn ? ' on' : ''}`}
                    aria-pressed={micOn}
                    aria-label="Microphone"
                    onClick={() => void toggleMic()}
                    disabled={!activeUser?.online}
                  >
                    <MicIcon />
                  </button>
                  <button
                    type="button"
                    className={`toggle${speakerOn ? ' on' : ''}`}
                    aria-pressed={speakerOn}
                    aria-label="Speaker"
                    onClick={() => void toggleSpeaker()}
                  >
                    <SpeakerIcon />
                  </button>
                </div>
              </header>

              <div className="transcript" aria-live="polite">
                {messages.map((m) => (
                  <article
                    key={m.id}
                    className={`msg${m.self ? ' self' : ''}${m.system ? ' system' : ''}`}
                  >
                    {!m.system ? (
                      <div className="msg-head">
                        <span className="msg-name">{m.from}</span>
                        <time>{m.at}</time>
                      </div>
                    ) : null}
                    <div className="msg-body">{m.text}</div>
                  </article>
                ))}
                <div ref={endRef} />
              </div>

              {error ? <p className="inline-error">{error}</p> : null}
              {call.callError ? <p className="inline-error">{call.callError}</p> : null}

              <form className="composer" onSubmit={onSend}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    canMessage
                      ? `Message ${activePeer}`
                      : 'Waiting for their public key'
                  }
                  aria-label="Message"
                  disabled={!canMessage}
                />
                <button className="btn btn-primary" type="submit" disabled={!canMessage}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="empty-conv">
              <h2>Pick someone to chat</h2>
              <p>1:1 messages and video calls are encrypted peer-to-peer.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

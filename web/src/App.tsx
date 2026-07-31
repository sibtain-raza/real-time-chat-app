import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WavePlane } from './components/WavePlane'
import { useChat } from './hooks/useChat'

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

export default function App() {
  const {
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
  } = useChat()

  const [host, setHost] = useState('')
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function onConnect(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !key.trim()) return
    try {
      await connect(host.trim(), name.trim(), key)
    } catch {
      // error state handled in hook
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await sendText(text)
  }

  const connected = status === 'connected'

  return (
    <div className="app-shell">
      <WavePlane />

      {!connected ? (
        <main className="gate">
          <div className="gate-inner">
            <h1 className="brand">ChatApp</h1>
            <p className="tagline">Encrypted rooms for voices and words.</p>

            <form className="gate-form" onSubmit={onConnect}>
              <div className="field">
                <label htmlFor="host">Server</label>
                <input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="localhost:9090 (leave blank if same host)"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How others see you"
                  required
                  autoComplete="nickname"
                />
              </div>
              <div className="field">
                <label htmlFor="key">Encryption key</label>
                <input
                  id="key"
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Shared secret for this room"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="cta-row">
                <button className="btn btn-primary" type="submit" disabled={status === 'connecting'}>
                  {status === 'connecting' ? 'Connecting…' : 'Enter room'}
                </button>
              </div>
              {error ? <p className="gate-error">{error}</p> : null}
            </form>
          </div>
        </main>
      ) : (
        <main className="room">
          <header className="room-top">
            <h1 className="room-brand">ChatApp</h1>
            <div className="room-meta">
              <span>
                <span className="status-dot" />
                {name}
              </span>
              <button className="btn btn-ghost" type="button" onClick={disconnect}>
                Leave
              </button>
            </div>
          </header>

          <section className="transcript" aria-live="polite">
            {messages.map((m) => (
              <article
                key={m.id}
                className={`msg${m.self ? ' self' : ''}${m.from === 'system' ? ' system' : ''}`}
              >
                {m.from !== 'system' ? (
                  <div className="msg-head">
                    <span className="msg-name">{m.from}</span>
                    <time>{m.at}</time>
                  </div>
                ) : null}
                <div className="msg-body">{m.text}</div>
              </article>
            ))}
            <div ref={endRef} />
          </section>

          <form className="composer" onSubmit={onSend}>
            <div className="media-toggles">
              <button
                type="button"
                className={`toggle${micOn ? ' on' : ''}`}
                aria-pressed={micOn}
                aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
                onClick={() => void toggleMic()}
              >
                <MicIcon />
              </button>
              <button
                type="button"
                className={`toggle${speakerOn ? ' on' : ''}`}
                aria-pressed={speakerOn}
                aria-label={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
                onClick={() => void toggleSpeaker()}
              >
                <SpeakerIcon />
              </button>
            </div>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message"
              aria-label="Message"
            />
            <button className="btn btn-primary" type="submit">
              Send
            </button>
          </form>
        </main>
      )}
    </div>
  )
}

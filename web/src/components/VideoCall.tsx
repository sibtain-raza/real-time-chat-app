import type { CallPhase } from '../hooks/useVideoCall'

type Props = {
  phase: CallPhase
  peer: string | null
  muted: boolean
  cameraOff: boolean
  callError: string | null
  onAccept: () => void
  onReject: () => void
  onHangup: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
  attachLocalVideo: (el: HTMLVideoElement | null) => void
  attachRemoteVideo: (el: HTMLVideoElement | null) => void
}

export function VideoCall({
  phase,
  peer,
  muted,
  cameraOff,
  callError,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
  onToggleCamera,
  attachLocalVideo,
  attachRemoteVideo,
}: Props) {
  if (phase === 'idle') return null

  const title =
    phase === 'incoming'
      ? `${peer} is calling…`
      : phase === 'outgoing'
        ? `Calling ${peer}…`
        : `In call with ${peer}`

  return (
    <div className="call-overlay" role="dialog" aria-label="Video call">
      <div className="call-stage">
        <video className="call-remote" ref={attachRemoteVideo} autoPlay playsInline />
        <video className="call-local" ref={attachLocalVideo} autoPlay playsInline muted />
        <div className="call-meta">
          <p className="call-title">{title}</p>
          {callError ? <p className="call-error">{callError}</p> : null}
        </div>
        <div className="call-actions">
          {phase === 'incoming' ? (
            <>
              <button type="button" className="btn btn-primary" onClick={onAccept}>
                Accept
              </button>
              <button type="button" className="btn btn-danger" onClick={onReject}>
                Decline
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`toggle${muted ? ' on' : ''}`} onClick={onToggleMute}>
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                className={`toggle${cameraOff ? ' on' : ''}`}
                onClick={onToggleCamera}
              >
                {cameraOff ? 'Camera on' : 'Camera off'}
              </button>
              <button type="button" className="btn btn-danger" onClick={onHangup}>
                End call
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

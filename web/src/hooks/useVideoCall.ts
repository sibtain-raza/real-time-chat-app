import { useCallback, useEffect, useRef, useState } from 'react'
import type { CallSignal, ICEServer, Packet } from '../lib/protocol'
import { apiURL } from '../lib/protocol'

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'active'

const DEFAULT_ICE: ICEServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

type SendPacket = (pkt: Packet) => void

type Options = {
  sendPacket: SendPacket
  setCallHandler: (handler: ((pkt: Packet) => void) | null) => void
  host?: string
}

export function useVideoCall({ sendPacket, setCallHandler, host = '' }: Options) {
  const [phase, setPhase] = useState<CallPhase>('idle')
  const [peer, setPeer] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [callError, setCallError] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const peerRef = useRef<string | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const iceRef = useRef<ICEServer[]>(DEFAULT_ICE)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiURL('/api/config', host))
        if (!res.ok) return
        const data = (await res.json()) as { iceServers?: ICEServer[] }
        if (data.iceServers?.length) {
          iceRef.current = data.iceServers
        }
      } catch {
        // keep defaults
      }
    })()
  }, [host])

  const attachLocalVideo = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el
    if (el && localStreamRef.current) el.srcObject = localStreamRef.current
  }, [])

  const attachRemoteVideo = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el
    if (el && remoteStreamRef.current) el.srcObject = remoteStreamRef.current
  }, [])

  const cleanupMedia = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    peerRef.current = null
    setPeer(null)
    setMuted(false)
    setCameraOff(false)
    setPhase('idle')
  }, [])

  const ensurePeerConnection = useCallback(
    (username: string) => {
      if (pcRef.current) return pcRef.current
      const pc = new RTCPeerConnection({ iceServers: iceRef.current as RTCIceServer[] })
      pcRef.current = pc
      peerRef.current = username
      setPeer(username)

      const remote = new MediaStream()
      remoteStreamRef.current = remote
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote

      pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((track) => remote.addTrack(track))
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote
      }

      pc.onicecandidate = (ev) => {
        if (!ev.candidate || !peerRef.current) return
        const signal: CallSignal = {
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        }
        sendPacket({ type: 'call-ice', to: peerRef.current, signal })
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'connected') setPhase('active')
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          if (peerRef.current) sendPacket({ type: 'call-hangup', to: peerRef.current })
          cleanupMedia()
        }
      }

      return pc
    },
    [cleanupMedia, sendPacket],
  )

  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    return stream
  }, [])

  const hangup = useCallback(() => {
    if (peerRef.current) sendPacket({ type: 'call-hangup', to: peerRef.current })
    cleanupMedia()
  }, [cleanupMedia, sendPacket])

  const startCall = useCallback(
    async (username: string) => {
      setCallError(null)
      try {
        const stream = await getLocalStream()
        const pc = ensurePeerConnection(username)
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
        setPhase('outgoing')
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendPacket({
          type: 'call-offer',
          to: username,
          signal: { sdp: offer.sdp, type: offer.type },
        })
      } catch (err) {
        cleanupMedia()
        setCallError(err instanceof Error ? err.message : 'Could not start video call')
      }
    },
    [cleanupMedia, ensurePeerConnection, getLocalStream, sendPacket],
  )

  const acceptCall = useCallback(async () => {
    if (!peerRef.current) return
    setCallError(null)
    try {
      const stream = await getLocalStream()
      const pc = ensurePeerConnection(peerRef.current)
      stream.getTracks().forEach((track) => {
        if (!pc.getSenders().some((s) => s.track?.kind === track.kind)) {
          pc.addTrack(track, stream)
        }
      })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendPacket({
        type: 'call-answer',
        to: peerRef.current,
        signal: { sdp: answer.sdp, type: answer.type },
      })
      setPhase('active')
    } catch (err) {
      hangup()
      setCallError(err instanceof Error ? err.message : 'Could not accept call')
    }
  }, [ensurePeerConnection, getLocalStream, hangup, sendPacket])

  const rejectCall = useCallback(() => {
    hangup()
  }, [hangup])

  const toggleMute = useCallback(() => {
    const next = !muted
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next
    })
    setMuted(next)
  }, [muted])

  const toggleCamera = useCallback(() => {
    const next = !cameraOff
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next
    })
    setCameraOff(next)
  }, [cameraOff])

  useEffect(() => {
    const handler = async (pkt: Packet) => {
      if (!pkt.from) return
      try {
        if (pkt.type === 'call-offer' && pkt.signal?.sdp) {
          if (phase !== 'idle' && peerRef.current && peerRef.current !== pkt.from) {
            sendPacket({ type: 'call-hangup', to: pkt.from })
            return
          }
          const pc = ensurePeerConnection(pkt.from)
          await pc.setRemoteDescription({ type: 'offer', sdp: pkt.signal.sdp })
          setPhase('incoming')
          setPeer(pkt.from)
          peerRef.current = pkt.from
          return
        }

        if (pkt.type === 'call-answer' && pkt.signal?.sdp && pcRef.current) {
          await pcRef.current.setRemoteDescription({ type: 'answer', sdp: pkt.signal.sdp })
          setPhase('active')
          return
        }

        if (pkt.type === 'call-ice' && pkt.signal?.candidate && pcRef.current) {
          try {
            await pcRef.current.addIceCandidate({
              candidate: pkt.signal.candidate,
              sdpMid: pkt.signal.sdpMid ?? undefined,
              sdpMLineIndex: pkt.signal.sdpMLineIndex ?? undefined,
            })
          } catch {
            // ignore early candidates
          }
          return
        }

        if (pkt.type === 'call-hangup') cleanupMedia()
      } catch (err) {
        setCallError(err instanceof Error ? err.message : 'Call signaling failed')
        cleanupMedia()
      }
    }

    setCallHandler(handler)
    return () => setCallHandler(null)
  }, [cleanupMedia, ensurePeerConnection, phase, sendPacket, setCallHandler])

  useEffect(() => () => cleanupMedia(), [cleanupMedia])

  return {
    phase,
    peer,
    muted,
    cameraOff,
    callError,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
    attachLocalVideo,
    attachRemoteVideo,
  }
}

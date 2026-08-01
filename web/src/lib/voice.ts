const TARGET_RATE = 20000
const CHUNK = 1024

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 0x8000
  return out
}

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer
  const ratio = fromRate / toRate
  const newLen = Math.floor(buffer.length / ratio)
  const result = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    result[i] = buffer[Math.floor(i * ratio)]
  }
  return result
}

export type VoiceSender = (pcm: Uint8Array) => void

export class VoiceSession {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private playing = false
  private recording = false

  async startSpeaker(): Promise<void> {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: TARGET_RATE })
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.playing = true
  }

  stopSpeaker(): void {
    this.playing = false
  }

  get isPlaying() {
    return this.playing
  }

  get isRecording() {
    return this.recording
  }

  async playPCM(pcm: Uint8Array): Promise<void> {
    if (!this.playing) return
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: TARGET_RATE })
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const samples = new Int16Array(
      pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength),
    )
    const floats = int16ToFloat(samples)
    const audioBuffer = this.ctx.createBuffer(1, floats.length, TARGET_RATE)
    audioBuffer.copyToChannel(new Float32Array(floats), 0)
    const node = this.ctx.createBufferSource()
    node.buffer = audioBuffer
    node.connect(this.ctx.destination)
    node.start()
  }

  async startMic(onChunk: VoiceSender): Promise<void> {
    if (this.recording) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    this.ctx = this.ctx ?? new AudioContext()
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(CHUNK, 1, 1)
    this.processor.onaudioprocess = (ev) => {
      if (!this.recording) return
      const input = ev.inputBuffer.getChannelData(0)
      const down = downsample(input, this.ctx!.sampleRate, TARGET_RATE)
      const pcm = floatToInt16(down)
      onChunk(new Uint8Array(pcm.buffer.slice(0)))
    }
    this.source.connect(this.processor)
    this.processor.connect(this.ctx.destination)
    this.recording = true
  }

  stopMic(): void {
    this.recording = false
    this.processor?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.processor = null
    this.source = null
    this.stream = null
  }

  dispose(): void {
    this.stopMic()
    this.stopSpeaker()
    void this.ctx?.close()
    this.ctx = null
  }
}

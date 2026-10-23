/**
 * Shared sound engine for table screens. Browsers block audio until a user gesture, so the
 * table page shows a "Tap to enable sound" overlay that calls unlock(). Games register their
 * sounds (file URLs or synthesized recipes) and call play(name).
 */
type Synth = (ctx: AudioContext, destination: AudioNode, when: number) => void

const MUTE_KEY = 'gamehub:muted'

class SoundBoard {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private urls = new Map<string, string>()
  private buffers = new Map<string, AudioBuffer>()
  private synths = new Map<string, Synth>()
  private listeners = new Set<() => void>()
  muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'

  get unlocked() {
    return this.ctx?.state === 'running'
  }

  /** Register sound files by name (decoded once unlocked). */
  registerFiles(files: Record<string, string>) {
    for (const [name, url] of Object.entries(files)) {
      this.urls.set(name, url)
      if (this.ctx) void this.load(name, url)
    }
  }

  /** Register a synthesized sound: called with the context, a destination and a start time. */
  registerSynth(name: string, synth: Synth) {
    this.synths.set(name, synth)
  }

  /** Must run inside a user gesture (click/tap/key). */
  async unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 1
      this.master.connect(this.ctx.destination)
      for (const [name, url] of this.urls) void this.load(name, url)
    }
    if (this.ctx.state !== 'running') await this.ctx.resume()
    this.notify()
  }

  play(name: string, opts: { volume?: number; rate?: number; delayMs?: number } = {}) {
    if (!this.ctx || !this.master || this.muted || this.ctx.state !== 'running') return
    const when = this.ctx.currentTime + (opts.delayMs ?? 0) / 1000
    const gain = this.ctx.createGain()
    gain.gain.value = opts.volume ?? 1
    gain.connect(this.master)
    const buffer = this.buffers.get(name)
    if (buffer) {
      const src = this.ctx.createBufferSource()
      src.buffer = buffer
      src.playbackRate.value = opts.rate ?? 1
      src.connect(gain)
      src.start(when)
      return
    }
    this.synths.get(name)?.(this.ctx, gain, when)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // ignore
    }
    if (this.master) this.master.gain.value = muted ? 0 : 1
    this.notify()
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  private async load(name: string, url: string) {
    if (!this.ctx || this.buffers.has(name)) return
    try {
      const data = await (await fetch(url)).arrayBuffer()
      this.buffers.set(name, await this.ctx.decodeAudioData(data))
    } catch {
      console.warn(`[sound] failed to load ${name} (${url})`)
    }
  }
}

export const soundBoard = new SoundBoard()
export type { SoundBoard, Synth }

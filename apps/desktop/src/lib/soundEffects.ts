/**
 * Native Web Audio API Sound Synthesizer for LAAP
 * Zero external audio files, zero bundle weight, instant playback.
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioCtx) {
      audioCtx = new AudioCtx()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
  return audioCtx
}

export function isSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return localStorage.getItem('laap:sound-enabled') !== 'false'
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('laap:sound-enabled', String(enabled))
  } catch {}
  window.dispatchEvent(new CustomEvent('laap:sound-changed', { detail: enabled }))
}

/**
 * Crisp high-frequency metallic click on account selection or card focus
 */
export function playHextechSelect(): void {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.04) // E6

    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.05)
  } catch {
    // Graceful fallback if audio is blocked by user policy
  }
}

/**
 * Deep resonant bass pulse + harmonic bell for session launch
 */
export function playHextechLaunch(): void {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime

    // Bass fundamental
    const bass = ctx.createOscillator()
    const bassGain = ctx.createGain()
    bass.type = 'sine'
    bass.frequency.setValueAtTime(140, now)
    bass.frequency.exponentialRampToValueAtTime(65, now + 0.3)
    bassGain.gain.setValueAtTime(0.12, now)
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    bass.connect(bassGain)
    bassGain.connect(ctx.destination)
    bass.start(now)
    bass.stop(now + 0.35)

    // Harmonic Hextech chime
    const chime = ctx.createOscillator()
    const chimeGain = ctx.createGain()
    chime.type = 'triangle'
    chime.frequency.setValueAtTime(523.25, now) // C5
    chime.frequency.exponentialRampToValueAtTime(659.25, now + 0.25) // E5
    chimeGain.gain.setValueAtTime(0.08, now)
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    chime.connect(chimeGain)
    chimeGain.connect(ctx.destination)
    chime.start(now)
    chime.stop(now + 0.3)
  } catch {
    // Graceful fallback
  }
}

/**
 * Mechanical toggle tick for switching games or filters
 */
export function playHextechTab(): void {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.03)

    gain.gain.setValueAtTime(0.05, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.04)
  } catch {
    // Graceful fallback
  }
}

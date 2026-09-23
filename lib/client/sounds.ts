export type SoundName = "deal" | "chip" | "check" | "fold" | "allin" | "win" | "tick"

let ctx: AudioContext | null = null

function audio() {
  if (typeof window === "undefined") return null
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === "suspended") void ctx.resume()
  return ctx
}

export function playSound(name: SoundName, volume: number, enabled: boolean) {
  if (!enabled || volume <= 0) return
  const context = audio()
  if (!context) return
  const now = context.currentTime
  const master = context.createGain()
  master.gain.setValueAtTime(Math.max(0.001, volume), now)
  master.connect(context.destination)

  if (name === "deal") tone(context, master, 1800, now, 0.04, "triangle", 0.2)
  if (name === "chip") {
    tone(context, master, 980, now, 0.06, "sine", 0.25)
    tone(context, master, 1480, now + 0.03, 0.05, "sine", 0.18)
  }
  if (name === "check") tone(context, master, 220, now, 0.07, "square", 0.08)
  if (name === "fold") sweep(context, master, 420, 160, now, 0.16, 0.12)
  if (name === "allin") {
    tone(context, master, 140, now, 0.22, "sawtooth", 0.12)
    tone(context, master, 520, now + 0.04, 0.14, "triangle", 0.16)
  }
  if (name === "win") {
    ;[523, 659, 784, 1046].forEach((freq, index) => {
      tone(context, master, freq, now + index * 0.08, 0.16, "triangle", 0.16)
    })
  }
  if (name === "tick") tone(context, master, 880, now, 0.04, "sine", 0.12)
}

function tone(
  context: AudioContext,
  master: GainNode,
  freq: number,
  when: number,
  duration: number,
  type: OscillatorType,
  amount: number,
) {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)
  gain.gain.setValueAtTime(amount, when)
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration)
  osc.connect(gain)
  gain.connect(master)
  osc.start(when)
  osc.stop(when + duration + 0.02)
}

function sweep(
  context: AudioContext,
  master: GainNode,
  from: number,
  to: number,
  when: number,
  duration: number,
  amount: number,
) {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = "sine"
  osc.frequency.setValueAtTime(from, when)
  osc.frequency.exponentialRampToValueAtTime(to, when + duration)
  gain.gain.setValueAtTime(amount, when)
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration)
  osc.connect(gain)
  gain.connect(master)
  osc.start(when)
  osc.stop(when + duration + 0.02)
}

const BLOCKED =
  /\b(?:nigger|nigga|faggot|retard|kike|tranny)\b/i

export function sanitizeName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim()
  if (name.length < 2 || name.length > 16) return null
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u.test(name)) return null
  return name
}

export function moderateChat(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = raw.replace(/\s+/g, " ").trim()
  if (!text) return { ok: false, error: "Say something first." }
  if (text.length > 160) return { ok: false, error: "Keep messages under 160 characters." }
  if (BLOCKED.test(text)) return { ok: false, error: "That message was blocked." }
  return { ok: true, text }
}

export function allowChat(timestamps: number[], now: number, mutedUntil: number): { ok: true } | { ok: false; error: string; mutedUntil?: number } {
  if (now < mutedUntil) {
    return { ok: false, error: "Slow down for a few seconds." }
  }
  const recent = timestamps.filter((stamp) => now - stamp < 10_000)
  if (recent.length >= 6) {
    return { ok: false, error: "You're sending messages too quickly.", mutedUntil: now + 15_000 }
  }
  if (timestamps.length && now - timestamps[timestamps.length - 1] < 700) {
    return { ok: false, error: "Give the table a second." }
  }
  return { ok: true }
}

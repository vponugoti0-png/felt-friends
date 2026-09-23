import { AVATAR_COLORS, AVATAR_EMOJIS, type Avatar } from "@/lib/game/protocol"

export interface Settings {
  name: string
  sound: boolean
  volume: number
  reduceMotion: boolean
  avatar: Avatar
}

export interface RoomSession {
  token: string
  playerId: string
  name: string
}

const SETTINGS_KEY = "felt:settings"
const RECENT_KEY = "felt:recent"
const SETTINGS_EVENT = "felt-settings"
const RECENT_EVENT = "felt-recent"

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  sound: true,
  volume: 0.7,
  reduceMotion: false,
  avatar: { color: AVATAR_COLORS[5], emoji: AVATAR_EMOJIS[0] },
}

let settingsCache = DEFAULT_SETTINGS
let settingsRaw = ""
let recentCache: { code: string; at: number }[] = []
let recentRaw = ""

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  return readSettingsSnapshot()
}

function parseSettings(raw: string): Settings {
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      avatar: {
        color: AVATAR_COLORS.includes(parsed.avatar?.color ?? "")
          ? parsed.avatar!.color
          : DEFAULT_SETTINGS.avatar.color,
        emoji: AVATAR_EMOJIS.includes(parsed.avatar?.emoji ?? "")
          ? parsed.avatar!.emoji
          : DEFAULT_SETTINGS.avatar.emoji,
      },
      volume: clampVolume(parsed.volume ?? DEFAULT_SETTINGS.volume),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings) {
  const raw = JSON.stringify(settings)
  settingsRaw = raw
  settingsCache = settings
  localStorage.setItem(SETTINGS_KEY, raw)
  document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion)
  window.dispatchEvent(new Event(SETTINGS_EVENT))
}

export function subscribeSettings(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined
  const notify = () => onStoreChange()
  window.addEventListener(SETTINGS_EVENT, notify)
  window.addEventListener("storage", notify)
  return () => {
    window.removeEventListener(SETTINGS_EVENT, notify)
    window.removeEventListener("storage", notify)
  }
}

export function readSettingsSnapshot(): Settings {
  const raw = localStorage.getItem(SETTINGS_KEY) ?? ""
  if (raw === settingsRaw) return settingsCache
  settingsRaw = raw
  settingsCache = raw ? parseSettings(raw) : DEFAULT_SETTINGS
  return settingsCache
}

export function readServerSettings(): Settings {
  return DEFAULT_SETTINGS
}

export function sessionKey(code: string) {
  return `felt:session:${code.toUpperCase()}`
}

export function loadSession(code: string): RoomSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as RoomSession
    if (!parsed.token || !parsed.playerId) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSession(code: string, session: RoomSession) {
  localStorage.setItem(sessionKey(code), JSON.stringify(session))
  rememberRoom(code)
}

export function clearSession(code: string) {
  localStorage.removeItem(sessionKey(code))
}

export function rememberRoom(code: string) {
  const recent = loadRecent().filter((item) => item.code !== code.toUpperCase())
  recent.unshift({ code: code.toUpperCase(), at: Date.now() })
  const next = recent.slice(0, 8)
  const raw = JSON.stringify(next)
  recentRaw = raw
  recentCache = next
  localStorage.setItem(RECENT_KEY, raw)
  window.dispatchEvent(new Event(RECENT_EVENT))
}

export function subscribeRecent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined
  window.addEventListener(RECENT_EVENT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(RECENT_EVENT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

export function readRecentSnapshot() {
  const raw = localStorage.getItem(RECENT_KEY) ?? ""
  if (raw === recentRaw) return recentCache
  recentRaw = raw
  recentCache = parseRecent(raw)
  return recentCache
}

export function readServerRecent(): { code: string; at: number }[] {
  return []
}

export function loadRecent(): { code: string; at: number }[] {
  if (typeof window === "undefined") return []
  return readRecentSnapshot()
}

function parseRecent(raw: string): { code: string; at: number }[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { code: string; at: number }[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function clampVolume(value: number) {
  if (Number.isNaN(value)) return 0.7
  return Math.min(1, Math.max(0, value))
}

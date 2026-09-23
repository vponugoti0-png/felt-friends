import type { Card } from "@/lib/poker/cards"
import type { LegalActions, Street } from "@/lib/poker/hand"

export type RoomPhase = "lobby" | "hand" | "showdown" | "between" | "finished"
export type TableMode = "cash" | "sng"

export interface Avatar {
  color: string
  emoji: string
}

export interface PublicPlayer {
  id: string
  seat: number
  name: string
  avatar: Avatar
  stack: number
  streetBet: number
  folded: boolean
  allIn: boolean
  sittingOut: boolean
  isBot: boolean
  isHost: boolean
  connected: boolean
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  hasCards: boolean
  hole: [Card, Card] | null
  isTurn: boolean
  lastAction: string | null
  handName?: string
  bestFive?: string[]
  eliminated: boolean
}

export interface SpectatorInfo {
  id: string
  name: string
  avatar: Avatar
}

export interface WinnerInfo {
  playerId: string
  name: string
  seat: number
  amount: number
  handName?: string
}

export interface YouInfo {
  id: string
  seat: number | null
  isHost: boolean
  isSpectator: boolean
  hole: [Card, Card] | null
  legal: LegalActions | null
  sittingOut: boolean
  stack: number
}

export interface TableState {
  code: string
  phase: RoomPhase
  mode: TableMode
  street: Street | null
  handNumber: number
  pot: number
  community: Card[]
  players: PublicPlayer[]
  spectators: SpectatorInfo[]
  buttonSeat: number | null
  smallBlind: number
  bigBlind: number
  startingStack: number
  actionTimeSec: number
  turnEndsAt: number | null
  serverNow: number
  paused: boolean
  hostId: string
  listed: boolean
  banner: string | null
  winners: WinnerInfo[]
  you: YouInfo | null
  maxSeats: number
  championName: string | null
}

export interface HandHistoryEntry {
  handNumber: number
  board: Card[]
  pot: number
  reason: "fold" | "showdown"
  winners: { name: string; amount: number; handName?: string }[]
  players: { name: string; hole: [Card, Card] | null; folded: boolean; net: number }[]
  endedAt: number
}

export interface ChatMessage {
  id: string
  playerId: string
  name: string
  text: string
  at: number
  spectator: boolean
}

export interface RoomSummary {
  code: string
  mode: TableMode
  phase: RoomPhase
  smallBlind: number
  bigBlind: number
  playerCount: number
  spectatorCount: number
  handNumber: number
  createdAt: number
}

export type AnimEvent =
  | { type: "deal-hole" }
  | { type: "deal-board"; count: number }
  | { type: "bet"; seat: number; amount: number; allIn: boolean }
  | { type: "check"; seat: number }
  | { type: "fold"; seat: number }
  | { type: "gather" }
  | { type: "win"; seat: number; amount: number; handName?: string; name: string }
  | { type: "reaction"; playerId: string; emoji: string; id: string }

export interface TableSnapshot {
  state: TableState
  events: AnimEvent[]
  chat: ChatMessage[]
  history: HandHistoryEntry[]
}

export const AVATAR_COLORS = [
  "#e11d48",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
]

export const AVATAR_EMOJIS = ["🦊", "🐼", "🐸", "🐙", "🦄", "🐯", "🐧", "🐲"]

export const REACTIONS = ["😂", "🔥", "👏", "😱", "🃏", "💰", "😤", "🥳", "💀", "👍"]

export const MAX_SEATS = 9

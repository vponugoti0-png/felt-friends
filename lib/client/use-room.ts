"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { SEAT_SLOTS, visualIndex } from "@/lib/client/seats"
import { clearSession, loadSession, saveSession } from "@/lib/client/settings"
import { emitAck, getSocket } from "@/lib/client/socket"
import { playSound, type SoundName } from "@/lib/client/sounds"
import type { AnimEvent, ChatMessage, HandHistoryEntry, TableSnapshot, TableState } from "@/lib/game/protocol"
import type { PlayerAction } from "@/lib/poker/hand"

export interface ChipFly {
  id: string
  fromX: string
  fromY: string
  toX: string
  toY: string
  color: string
}

export interface FloatingReaction {
  id: string
  emoji: string
  x: string
  y: string
}

type Ack = { ok: true } | { ok: false; error: string }

export function useRoom(code: string, sound: { enabled: boolean; volume: number }) {
  const [state, setState] = useState<TableState | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [history, setHistory] = useState<HandHistoryEntry[]>([])
  const [status, setStatus] = useState<"loading" | "gate" | "live" | "closed">("loading")
  const [error, setError] = useState<string | null>(null)
  const [dealing, setDealing] = useState(false)
  const [flies, setFlies] = useState<ChipFly[]>([])
  const [reactions, setReactions] = useState<FloatingReaction[]>([])

  useEffect(() => {
    const socket = getSocket()
    const onUpdate = (payload: TableSnapshot) => {
      setState(payload.state)
      setChat(payload.chat)
      setHistory(payload.history)
      setStatus("live")
      setError(null)
      if (payload.events.length) {
        for (const event of payload.events) {
          const name = soundFor(event)
          if (name) playSound(name, sound.volume, sound.enabled)
        }
        const hero = payload.state.you?.seat ?? null
        const nextFlies: ChipFly[] = []
        const nextReactions: FloatingReaction[] = []
        let dealt = false
        payload.events.forEach((event, index) => {
          if (event.type === "deal-hole" || event.type === "deal-board") dealt = true
          if (event.type === "bet" || event.type === "win") {
            const slot = SEAT_SLOTS[visualIndex(event.seat, hero)] ?? SEAT_SLOTS[0]
            const towardPot = event.type === "bet"
            nextFlies.push({
              id: `${payload.state.handNumber}-${index}-${event.seat}`,
              fromX: towardPot ? `${slot.x}%` : "50%",
              fromY: towardPot ? `${slot.y}%` : "46%",
              toX: towardPot ? "50%" : `${slot.x}%`,
              toY: towardPot ? "46%" : `${slot.y}%`,
              color: event.type === "win" ? "#facc15" : "#dc2626",
            })
          }
          if (event.type === "reaction") {
            const player = payload.state.players.find((item) => item.id === event.playerId)
            const slot = SEAT_SLOTS[visualIndex(player?.seat ?? 0, hero)] ?? SEAT_SLOTS[0]
            nextReactions.push({ id: event.id, emoji: event.emoji, x: `${slot.x}%`, y: `${slot.y}%` })
          }
        })
        if (dealt) {
          setDealing(true)
          window.setTimeout(() => setDealing(false), 700)
        }
        if (nextFlies.length) {
          setFlies(nextFlies)
          window.setTimeout(() => setFlies([]), 800)
        }
        if (nextReactions.length) {
          setReactions(nextReactions)
          window.setTimeout(() => setReactions([]), 1400)
        }
      }
    }
    const onClosed = () => setStatus("closed")
    const onConnect = () => {
      const session = loadSession(code)
      if (!session) {
        setStatus((current) => (current === "live" ? current : "gate"))
        return
      }
      socket.emit("session:resume", { token: session.token }, (response: Ack) => {
        if (!response.ok) {
          clearSession(code)
          setStatus("gate")
          setError(response.error)
        }
      })
    }
    socket.on("table:update", onUpdate)
    socket.on("table:closed", onClosed)
    socket.on("connect", onConnect)
    if (socket.connected) onConnect()
    return () => {
      socket.off("table:update", onUpdate)
      socket.off("table:closed", onClosed)
      socket.off("connect", onConnect)
    }
  }, [code, sound.enabled, sound.volume])

  const fail = useCallback((response: Ack) => {
    if (!response.ok) {
      setError(response.error)
      toast.error(response.error)
    }
    return response.ok
  }, [])

  const join = useCallback(
    async (input: { name: string; avatar: { color: string; emoji: string }; spectate?: boolean }) => {
      const response = await emitAck<Ack & { token?: string; playerId?: string; name?: string }>("lobby:join", {
        code,
        ...input,
      })
      if (!fail(response) || !response.token || !response.playerId) return
      saveSession(code, { token: response.token, playerId: response.playerId, name: response.name ?? input.name })
      setStatus("live")
    },
    [code, fail],
  )

  const act = useCallback(
    async (action: PlayerAction) => {
      fail(await emitAck<Ack>("table:act", action))
    },
    [fail],
  )

  const send = useCallback(
    async (event: string, payload?: unknown) => {
      fail(await emitAck<Ack>(event, payload))
    },
    [fail],
  )

  return {
    state,
    chat,
    history,
    dealing,
    flies,
    reactions,
    status,
    error,
    join,
    act,
    send,
  }
}

function soundFor(event: AnimEvent): SoundName | null {
  if (event.type === "deal-hole" || event.type === "deal-board") return "deal"
  if (event.type === "bet") return event.allIn ? "allin" : "chip"
  if (event.type === "check") return "check"
  if (event.type === "fold") return "fold"
  if (event.type === "gather") return "chip"
  if (event.type === "win") return "win"
  return null
}

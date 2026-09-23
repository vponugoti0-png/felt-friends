"use client"

import { useEffect, useState } from "react"

import { AvatarBubble } from "@/components/felt/avatar-picker"
import { ChipStack } from "@/components/felt/chips"
import { PlayingCard } from "@/components/felt/playing-card"
import { playSound } from "@/lib/client/sounds"
import { formatChips, cardKey } from "@/lib/poker/cards"
import type { PublicPlayer } from "@/lib/game/protocol"
import { cn } from "cn"

export function SeatView({
  player,
  turnEndsAt,
  serverNow,
  actionMs,
  hero,
  sound,
  volume,
}: {
  player: PublicPlayer
  turnEndsAt: number | null
  serverNow: number
  actionMs: number
  hero: boolean
  sound: boolean
  volume: number
}) {
  const [remain, setRemain] = useState(actionMs)
  useEffect(() => {
    if (!player.isTurn || !turnEndsAt) return
    const at = Date.now()
    let lastSecond = -1
    const id = window.setInterval(() => {
      const next = Math.max(0, turnEndsAt - serverNow - (Date.now() - at))
      setRemain(next)
      if (!hero || !sound || next <= 0 || next > 5000) return
      const second = Math.ceil(next / 1000)
      if (lastSecond === second) return
      lastSecond = second
      playSound("tick", volume * 0.45, true)
    }, 100)
    return () => window.clearInterval(id)
  }, [player.isTurn, turnEndsAt, serverNow, hero, sound, volume])

  const pct = player.isTurn && turnEndsAt ? Math.max(0, Math.min(1, remain / actionMs)) : 0
  const best = new Set(player.bestFive ?? [])

  return (
    <div className={cn("flex w-[108px] flex-col items-center gap-1 text-center", player.folded && "opacity-50")}>
      <div className="relative">
        {player.isTurn ? (
          <svg className="timer-ring absolute -inset-1.5 size-[60px]" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={remain < 5000 ? "#fb7185" : "#e4c36a"}
              strokeWidth="2.4"
              strokeDasharray={`${pct * 100} 100`}
              strokeLinecap="round"
            />
          </svg>
        ) : null}
        <AvatarBubble avatar={player.avatar} name={player.name} ring={player.isTurn} />
        {player.isDealer ? (
          <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-white text-[10px] font-bold text-black">
            D
          </span>
        ) : null}
      </div>
      <div className="max-w-full rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium">
        <span className="block truncate">
          {player.name}
          {hero ? " · you" : ""}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[#f6e7bf]">
        <ChipStack amount={Math.max(player.stack, 1)} />
        <span>{formatChips(player.stack)}</span>
      </div>
      <div className="flex min-h-9 gap-1">
        {player.hole ? (
          player.hole.map((card, index) => (
            <PlayingCard
              key={cardKey(card)}
              card={card}
              mini
              delay={index * 70}
              highlight={best.has(cardKey(card))}
            />
          ))
        ) : player.hasCards ? (
          <>
            <PlayingCard faceDown mini />
            <PlayingCard faceDown mini delay={70} />
          </>
        ) : null}
      </div>
      <div className="flex min-h-4 flex-wrap justify-center gap-1">
        {player.isBot ? <Tag>BOT</Tag> : null}
        {player.isHost ? <Tag>HOST</Tag> : null}
        {player.isSmallBlind ? <Tag>SB</Tag> : null}
        {player.isBigBlind ? <Tag>BB</Tag> : null}
        {player.allIn ? <Tag>ALL-IN</Tag> : null}
        {player.sittingOut ? <Tag>OUT</Tag> : null}
        {player.eliminated ? <Tag>OUT</Tag> : null}
        {!player.connected && !player.isBot ? <Tag>AWAY</Tag> : null}
      </div>
      {player.streetBet > 0 ? (
        <div className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px]">
          <ChipStack amount={player.streetBet} />
          {formatChips(player.streetBet)}
        </div>
      ) : player.lastAction ? (
        <span className="max-w-[108px] truncate text-[10px] text-[#d9ccb4]">{player.lastAction}</span>
      ) : null}
      {player.handName ? <span className="text-[10px] text-[#e4c36a]">{player.handName}</span> : null}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-black/50 px-1 py-px text-[9px] tracking-wide text-[#f6e7bf] uppercase">{children}</span>
  )
}

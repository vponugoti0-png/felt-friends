"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { PlayingCard } from "@/components/felt/playing-card"
import { formatChips, type Card } from "@/lib/poker/cards"
import type { LegalActions } from "@/lib/poker/hand"

export function ActionBar({
  legal,
  hole,
  pot,
  bigBlind,
  onAct,
}: {
  legal: LegalActions | null
  hole: [Card, Card] | null
  pot: number
  bigBlind: number
  onAct: (action: { type: "fold" | "check" | "call" } | { type: "wager"; amount: number }) => void
}) {
  const min = legal?.minWager ?? bigBlind
  const max = legal?.maxWager ?? min
  const short = Boolean(legal?.canWager && min > max)
  const presets = useMemo(() => buildPresets(legal, pot, bigBlind, min, max, short), [legal, pot, bigBlind, min, max, short])

  return (
    <div className="shrink-0 border-t border-white/10 bg-[#0c1016]/95 px-3 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          {hole ? (
            <>
              <PlayingCard card={hole[0]} />
              <PlayingCard card={hole[1]} delay={90} />
            </>
          ) : (
            <p className="text-sm text-[#b7ab96]">Your hole cards show up here.</p>
          )}
        </div>
        {legal ? (
          <WagerControls
            key={`${min}:${max}:${legal.wagerIsRaise}:${legal.callAmount}`}
            legal={legal}
            min={min}
            max={max}
            short={short}
            presets={presets}
            onAct={onAct}
          />
        ) : (
          <p className="text-sm text-[#b7ab96]">Waiting on the next action.</p>
        )}
      </div>
    </div>
  )
}

function WagerControls({
  legal,
  min,
  max,
  short,
  presets,
  onAct,
}: {
  legal: LegalActions
  min: number
  max: number
  short: boolean
  presets: { label: string; amount: number }[]
  onAct: (action: { type: "fold" | "check" | "call" } | { type: "wager"; amount: number }) => void
}) {
  const [amount, setAmount] = useState(short ? max : min)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return
      const key = event.key.toLowerCase()
      if (key === "f" && legal.fold) onAct({ type: "fold" })
      if (key === "c" && legal.check) onAct({ type: "check" })
      if (key === "c" && legal.call && !legal.check) onAct({ type: "call" })
      if (key === "a" && legal.canWager) onAct({ type: "wager", amount: max })
      if (key === "r" && legal.canWager) onAct({ type: "wager", amount: short ? max : amount })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [legal, amount, max, onAct, short])

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {legal.fold ? (
          <Button type="button" variant="destructive" className="h-11 px-4" onClick={() => onAct({ type: "fold" })}>
            Fold
          </Button>
        ) : null}
        {legal.check ? (
          <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => onAct({ type: "check" })}>
            Check
          </Button>
        ) : null}
        {legal.call ? (
          <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => onAct({ type: "call" })}>
            Call {formatChips(legal.callAmount)}
          </Button>
        ) : null}
        {legal.canWager ? (
          <Button type="button" className="h-11 px-4" onClick={() => onAct({ type: "wager", amount: short ? max : amount })}>
            {short ? `All-in ${formatChips(max)}` : `${legal.wagerIsRaise ? "Raise to" : "Bet"} ${formatChips(amount)}`}
          </Button>
        ) : null}
      </div>
      {legal.canWager && !short ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            aria-label="Bet amount"
            className="h-2 flex-1 accent-[#e4c36a]"
            type="range"
            min={min}
            max={max}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) =>
              preset.label === "All-in" ? (
                <Button key={preset.label} type="button" size="sm" onClick={() => onAct({ type: "wager", amount: max })}>
                  All-in {formatChips(max)}
                </Button>
              ) : (
                <Button key={preset.label} type="button" size="sm" variant="outline" onClick={() => setAmount(preset.amount)}>
                  {preset.label}
                </Button>
              ),
            )}
          </div>
        </div>
      ) : null}
      <p className="text-[11px] tracking-wide text-[#b7ab96] uppercase">
        F fold · C check/call · R bet/raise · All-in shoves now
      </p>
    </div>
  )
}

function buildPresets(
  legal: LegalActions | null,
  pot: number,
  bigBlind: number,
  min: number,
  max: number,
  short: boolean,
) {
  if (!legal?.canWager || short) return []
  const call = legal.callAmount
  const half = Math.round((legal.wagerIsRaise ? min : 0) + Math.max(bigBlind, (pot + call) / 2))
  const potSized = Math.round(call + pot + (legal.wagerIsRaise ? Math.max(0, min - call) : 0))
  const items = [
    { label: "Min", amount: min },
    { label: "½ pot", amount: clamp(half, min, max) },
    { label: "Pot", amount: clamp(Math.max(min, potSized || pot || bigBlind), min, max) },
    { label: "All-in", amount: max },
  ]
  const seen = new Set<number>()
  return items.filter((item) => {
    if (item.label === "All-in") return true
    if (seen.has(item.amount)) return false
    seen.add(item.amount)
    return true
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

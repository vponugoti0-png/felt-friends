"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { ActionBar } from "@/components/felt/action-bar"
import { AvatarPicker } from "@/components/felt/avatar-picker"
import { ChipStack } from "@/components/felt/chips"
import { PlayingCard } from "@/components/felt/playing-card"
import { SeatView } from "@/components/felt/seat"
import { SettingsDialog } from "@/components/felt/settings-dialog"
import { SideRail } from "@/components/felt/side-rail"
import { useSettings } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SEAT_SLOTS, visualIndex } from "@/lib/client/seats"
import { useRoom } from "@/lib/client/use-room"
import { playSound } from "@/lib/client/sounds"
import { formatChips, cardKey } from "@/lib/poker/cards"
import { cn } from "cn"

export function TableScreen({ code }: { code: string }) {
  const { settings, update } = useSettings()
  const room = useRoom(code, { enabled: settings.sound, volume: settings.volume })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rail, setRail] = useState(false)

  const turnKey = room.state?.you?.legal ? `${room.state.handNumber}:${room.state.street}:${room.state.you.id}` : ""
  useEffect(() => {
    if (!turnKey) return
    toast("Your turn", { description: "Fold, call, or put in a bet." })
    playSound("tick", settings.volume, settings.sound)
  }, [turnKey, settings.sound, settings.volume])

  const heroSeat = room.state?.you?.seat ?? null
  const winnerLine = useMemo(() => {
    if (room.state?.phase !== "showdown") return null
    if (!room.state.winners.length) return room.state.banner
    const [first] = room.state.winners
    if (room.state.winners.length > 1 && room.state.winners.every((winner) => winner.handName === first.handName)) {
      return `Split pot · ${first.handName ?? "chop"}`
    }
    return first.handName ?? room.state.banner
  }, [room.state])

  async function copyInvite() {
    const link = `${window.location.origin}/room/${code}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Invite link copied")
    } catch {
      toast(link)
    }
  }

  if (room.status === "loading") {
    return <Centered title="Pulling up a chair…" body="Connecting to the table." />
  }
  if (room.status === "closed") {
    return <Centered title="This table closed" body="Rooms live in memory and disappear when everyone leaves." />
  }
  if (room.status === "gate" || !room.state) {
    return (
      <main className="casino-bg grid min-h-dvh place-items-center px-4">
        <form
          className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-[#141820] p-6 shadow-2xl"
          onSubmit={(event) => {
            event.preventDefault()
            const display = settings.name.trim()
            void room.join({ name: display, avatar: settings.avatar })
          }}
        >
          <p className="font-display text-3xl text-[#e4c36a]">Join {code}</p>
          <p className="text-sm text-[#b7ab96]">Play chips only. No real-money gambling.</p>
          {room.error ? <p className="text-sm text-rose-300">{room.error}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="join-name">Display name</Label>
            <Input
              id="join-name"
              value={settings.name}
              maxLength={16}
              onChange={(event) => update({ name: event.target.value })}
              required
            />
          </div>
          <AvatarPicker value={settings.avatar} onChange={(avatar) => update({ avatar })} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Take a seat</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void room.join({ name: settings.name.trim(), avatar: settings.avatar, spectate: true })
              }}
            >
              Watch
            </Button>
            <Button type="button" variant="ghost" render={<Link href="/" />}>
              Lobby
            </Button>
          </div>
        </form>
      </main>
    )
  }

  const state = room.state
  const you = state.you

  return (
    <main className="casino-bg flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Link href="/" className="font-display text-xl text-[#e4c36a]">
          Felt Friends
        </Link>
        <button type="button" className="rounded-full bg-white/10 px-3 py-1 text-sm tracking-[0.2em]" onClick={() => void copyInvite()}>
          {code}
        </button>
        <span className="hidden text-xs text-[#b7ab96] sm:inline">
          {state.smallBlind}/{state.bigBlind} · {formatChips(state.startingStack)} start · {state.mode === "sng" ? "Sit & go" : "Cash chips"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" className="lg:hidden" onClick={() => setRail((open) => !open)}>
            {rail ? "Table" : "Chat"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => update({ sound: !settings.sound })}>
            {settings.sound ? "Sound on" : "Muted"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          {you?.seat !== null ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => void room.send("table:sitout", { sittingOut: !you?.sittingOut })}>
              {you?.sittingOut ? "Sit in" : "Sit out"}
            </Button>
          ) : null}
          {you && you.stack === 0 && state.mode === "cash" && state.phase !== "hand" ? (
            <Button type="button" size="sm" onClick={() => void room.send("table:rebuy")}>
              Rebuy
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative mx-auto flex w-full max-w-5xl flex-1 items-center px-2 py-3">
            <div className={cn("felt-rail relative aspect-[16/10] w-full max-h-full rounded-[999px] p-3 sm:p-4", room.dealing && "dealing")}>
              <div className="felt relative h-full w-full overflow-hidden rounded-[999px]">
                <Dealer />
                <div className="absolute top-[34%] left-1/2 flex w-[70%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
                  <div className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-sm text-[#f6e7bf]">
                    <ChipStack amount={Math.max(state.pot, 1)} />
                    Pot {formatChips(state.pot)}
                  </div>
                  <div className="flex min-h-[74px] items-center gap-1.5">
                    {state.community.map((card, index) => (
                      <PlayingCard
                        key={cardKey(card)}
                        card={card}
                        delay={index * 80}
                        highlight={state.players.some((player) => player.bestFive?.includes(cardKey(card)))}
                      />
                    ))}
                  </div>
                  {state.banner ? <p className="max-w-md text-center text-xs text-[#f6e7bf]">{state.banner}</p> : null}
                </div>

                {state.players.map((player) => {
                  const slot = SEAT_SLOTS[visualIndex(player.seat, heroSeat)]
                  return (
                    <div
                      key={player.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    >
                      <SeatView
                        player={player}
                        hero={player.id === you?.id}
                        turnEndsAt={player.isTurn ? state.turnEndsAt : null}
                        serverNow={state.serverNow}
                        actionMs={state.actionTimeSec * 1000}
                        sound={settings.sound}
                        volume={settings.volume}
                      />
                    </div>
                  )
                })}

                {Array.from({ length: state.maxSeats }, (_, seat) => seat)
                  .filter((seat) => !state.players.some((player) => player.seat === seat))
                  .map((seat) => {
                    const slot = SEAT_SLOTS[visualIndex(seat, heroSeat)]
                    return (
                      <button
                        key={seat}
                        type="button"
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/30 px-3 py-2 text-[11px] text-white/70 hover:bg-white/10"
                        style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                        onClick={() => void room.send("table:sit", { seat })}
                      >
                        Sit
                      </button>
                    )
                  })}

                {room.flies.map((fly) => (
                  <span
                    key={fly.id}
                    className="fly-chip"
                    style={{
                      background: fly.color,
                      ["--from-x" as string]: fly.fromX,
                      ["--from-y" as string]: fly.fromY,
                      ["--to-x" as string]: fly.toX,
                      ["--to-y" as string]: fly.toY,
                    }}
                  />
                ))}
                {room.reactions.map((reaction) => (
                  <span key={reaction.id} className="reaction-pop" style={{ left: reaction.x, top: reaction.y }}>
                    {reaction.emoji}
                  </span>
                ))}

                {state.phase === "showdown" && winnerLine ? (
                  <div className="winner-banner absolute top-[58%] left-1/2 w-[min(92%,420px)] -translate-x-1/2 rounded-2xl bg-black/75 px-4 py-3 text-center">
                    <p className="font-display text-2xl text-[#e4c36a]">{winnerLine}</p>
                    <p className="mt-1 text-sm text-[#f6f1e6]">
                      {state.winners.map((winner) => `${winner.name} +${formatChips(winner.amount)}`).join(" · ")}
                    </p>
                  </div>
                ) : null}

                {state.phase === "finished" ? (
                  <div className="winner-banner absolute inset-0 grid place-items-center bg-black/55">
                    <div className="text-center">
                      <p className="font-display text-4xl text-[#e4c36a]">{state.championName ?? "Winner"}</p>
                      <p className="mt-1 text-sm">takes the sit & go.</p>
                    </div>
                  </div>
                ) : null}

                {state.phase === "lobby" ? (
                  <div className="absolute inset-x-[18%] top-[62%] text-center">
                    <p className="text-sm text-[#f6e7bf]">Waiting for friends. Share code {code}.</p>
                    {you?.isHost ? (
                      <Button type="button" className="mt-2" onClick={() => void room.send("host:start")}>
                        Deal the first hand
                      </Button>
                    ) : (
                      <p className="mt-1 text-xs text-[#b7ab96]">The host starts when the table is ready.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {you?.isSpectator ? (
            <p className="px-4 pb-2 text-center text-sm text-[#b7ab96]">You&apos;re watching. Grab an empty seat between hands.</p>
          ) : null}
          <ActionBar
            legal={you?.legal ?? null}
            hole={you?.hole ?? null}
            pot={state.pot}
            bigBlind={state.bigBlind}
            onAct={(action) => void room.act(action)}
          />
        </section>
        <aside
          className={cn(
            "border-white/10 bg-[#10141c]/95 lg:flex lg:w-[340px] lg:flex-col lg:border-l",
            rail ? "fixed inset-x-0 bottom-0 z-40 flex h-[52dvh] flex-col rounded-t-3xl border-t lg:static lg:h-auto" : "hidden",
          )}
        >
          <SideRail
            chat={room.chat}
            history={room.history}
            players={state.players}
            isHost={Boolean(you?.isHost)}
            paused={state.paused}
            smallBlind={state.smallBlind}
            bigBlind={state.bigBlind}
            onChat={(text) => void room.send("table:chat", { text })}
            onReact={(emoji) => void room.send("table:react", { emoji })}
            onKick={(playerId) => void room.send("host:kick", { playerId })}
            onPause={(paused) => void room.send("host:pause", { paused })}
            onBlinds={(smallBlind, bigBlind) => void room.send("host:blinds", { smallBlind, bigBlind })}
            onAddBot={() => void room.send("host:add-bot")}
            onRemoveBot={(playerId) => void room.send("host:remove-bot", { playerId })}
            onStart={() => void room.send("host:start")}
            onStop={() => void room.send("host:stop")}
          />
        </aside>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onRename={(next) => void room.send("player:rename", { name: next })}
      />
      <p className="sr-only">Play chips only. No real money.</p>
    </main>
  )
}

function Dealer() {
  return (
    <div className="dealer-bust pointer-events-none absolute top-[8%] left-1/2 -translate-x-1/2 text-center">
      <svg width="72" height="64" viewBox="0 0 72 64" aria-hidden>
        <ellipse cx="36" cy="58" rx="22" ry="6" fill="rgba(0,0,0,0.25)" />
        <path d="M16 46c2-14 10-22 20-22s18 8 20 22" fill="#1f2937" />
        <circle cx="36" cy="22" r="12" fill="#f3d2b5" />
        <path d="M24 20c2-10 20-12 26-2" fill="#2b2118" />
        <circle cx="32" cy="22" r="1.2" fill="#1f2937" />
        <circle cx="41" cy="22" r="1.2" fill="#1f2937" />
        <path d="M32 27c2 2 6 2 8 0" stroke="#9a3412" strokeWidth="1.2" fill="none" />
        <path d="M8 40c8 2 10 8 12 12" stroke="#e4c36a" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-[10px] tracking-[0.2em] text-[#f6e7bf] uppercase">Dealer</p>
    </div>
  )
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <main className="casino-bg grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="font-display text-4xl text-[#e4c36a]">{title}</h1>
        <p className="mt-2 text-[#b7ab96]">{body}</p>
        <Button className="mt-4" render={<Link href="/" />}>
          Back to the lobby
        </Button>
      </div>
    </main>
  )
}

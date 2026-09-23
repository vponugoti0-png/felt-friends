"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
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

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(label)
    } catch {
      toast(value)
    }
  }

  if (room.status === "loading") {
    return <Centered title="Pulling up a chair…" body="Connecting to the table." />
  }
  if (room.status === "closed") {
    return <Centered title="This table closed" body="Rooms live in memory and disappear when everyone leaves." />
  }
  if (room.status === "conflict") {
    return (
      <Centered
        title="You're already seated in another tab"
        body="This browser already has a seat at this table. Watch from here, or move the seat to this tab. The other tab will be told — you are not sat out."
      >
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void room.join({ name: settings.name.trim() || "Guest", avatar: settings.avatar, spectate: true, remember: false })}
          >
            Watch from here
          </Button>
          <Button type="button" onClick={() => void room.takeover()}>
            Play in this tab
          </Button>
        </div>
      </Centered>
    )
  }
  if (room.status === "displaced") {
    return (
      <Centered
        title="Your seat moved to another tab"
        body={room.notice ?? "This tab is no longer playing that seat. You were not sat out."}
      >
        <Button type="button" onClick={() => void room.takeover()}>
          Play in this tab
        </Button>
      </Centered>
    )
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
          <p className="text-sm text-[#b7ab96]">Anyone with this code can join — treat it like a party invite.</p>
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
    <main className="casino-bg flex h-dvh max-w-[100vw] flex-col overflow-x-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <Link href="/" className="font-display text-xl text-[#e4c36a]">
          Felt Friends
        </Link>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm tracking-[0.2em]">{code}</span>
        <Button type="button" size="sm" onClick={() => void copyText(code, "Room code copied")}>
          Copy code
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void copyText(`${window.location.origin}/room/${code}`, "Share link copied")}
        >
          Share link
        </Button>
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

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center overflow-hidden px-1 py-1 sm:px-2 sm:py-3">
            <div className={cn("felt-rail relative h-full w-full max-w-full overflow-hidden rounded-[1.5rem] p-2 sm:aspect-[16/10] sm:h-auto sm:max-h-full sm:rounded-[999px] sm:p-4", room.dealing && "dealing")}>
              <div className="felt relative flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] sm:rounded-[999px]">
                <Dealer />
                <div className="flex flex-wrap items-start justify-center gap-x-1 gap-y-1 px-1 pt-1 sm:contents">
                  {state.players
                    .filter((player) => player.id !== you?.id)
                    .map((player) => {
                      const slot = SEAT_SLOTS[visualIndex(player.seat, heroSeat)]
                      return (
                        <div
                          key={player.id}
                          className="seat-anchor"
                          style={{ ["--seat-x" as string]: `${slot.x}%`, ["--seat-y" as string]: `${slot.y}%` }}
                        >
                          <SeatView
                            player={player}
                            hero={false}
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
                          className="seat-anchor self-start rounded-full border border-dashed border-white/30 px-2 py-1 text-[10px] text-white/70 hover:bg-white/10 sm:px-3 sm:py-2 sm:text-[11px]"
                          style={{ ["--seat-x" as string]: `${slot.x}%`, ["--seat-y" as string]: `${slot.y}%` }}
                          onClick={() => void room.send("table:sit", { seat })}
                        >
                          Sit
                        </button>
                      )
                    })}
                </div>
                <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 px-2 sm:absolute sm:top-[34%] sm:left-1/2 sm:w-[70%] sm:flex-none sm:-translate-x-1/2 sm:-translate-y-1/2">
                  <div className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-sm text-[#f6e7bf]">
                    <ChipStack amount={Math.max(state.pot, 1)} />
                    Pot {formatChips(state.pot)}
                  </div>
                  <div className="flex min-h-12 items-center gap-1 sm:min-h-[74px] sm:gap-1.5">
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
                  {state.phase === "lobby" ? (
                    <div className="text-center">
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
                <div className="flex justify-center pb-1 sm:contents">
                  {state.players
                    .filter((player) => player.id === you?.id)
                    .map((player) => {
                      const slot = SEAT_SLOTS[visualIndex(player.seat, heroSeat)]
                      return (
                        <div
                          key={player.id}
                          className="seat-anchor"
                          style={{ ["--seat-x" as string]: `${slot.x}%`, ["--seat-y" as string]: `${slot.y}%` }}
                        >
                          <SeatView
                            player={player}
                            hero
                            turnEndsAt={player.isTurn ? state.turnEndsAt : null}
                            serverNow={state.serverNow}
                            actionMs={state.actionTimeSec * 1000}
                            sound={settings.sound}
                            volume={settings.volume}
                          />
                        </div>
                      )
                    })}
                </div>

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

              </div>
            </div>
          </div>
          {you?.isSpectator ? (
            <p className="px-4 pb-2 text-center text-sm text-[#b7ab96]">You&apos;re watching. Grab an empty seat between hands.</p>
          ) : null}
          <p className="mx-auto mb-1 w-fit shrink-0 rounded-full border border-[#e4c36a]/40 bg-[#e4c36a]/10 px-3 py-1 text-center text-xs text-[#f6e7bf]">
            Play chips only · no real money
          </p>
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
            practice={state.practice}
            bench={state.botBench}
            onAddBot={(name) => void room.send("host:add-bot", name ? { name } : {})}
            onAddGroup={() => void room.send("host:add-group")}
            onClearBots={() => void room.send("host:clear-bots")}
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

function Centered({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <main className="casino-bg grid min-h-dvh place-items-center px-4 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-4xl text-[#e4c36a]">{title}</h1>
        <p className="mt-2 text-[#b7ab96]">{body}</p>
        {children ? <div className="mt-4">{children}</div> : null}
        <Button className="mt-4" render={<Link href="/" />}>
          Back to the lobby
        </Button>
      </div>
    </main>
  )
}

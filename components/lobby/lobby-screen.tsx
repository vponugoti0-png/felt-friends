"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { AvatarPicker } from "@/components/felt/avatar-picker"
import { SettingsDialog } from "@/components/felt/settings-dialog"
import { useSettings } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { loadSession, readRecentSnapshot, readServerRecent, saveSession, subscribeRecent } from "@/lib/client/settings"
import { emitAck, getSocket } from "@/lib/client/socket"
import { PRACTICE_CODE, type RoomSummary, type TableMode } from "@/lib/game/protocol"

type Ack = { ok: false; error: string } | ({ ok: true; code: string; token: string; playerId: string; name?: string })

export function LobbyScreen() {
  const router = useRouter()
  const { settings, update } = useSettings()
  const [code, setCode] = useState("")
  const [sb, setSb] = useState("50")
  const [bb, setBb] = useState("100")
  const [stack, setStack] = useState("10000")
  const [clock, setClock] = useState("25")
  const [mode, setMode] = useState<TableMode>("cash")
  const [listed, setListed] = useState(false)
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const recent = useSyncExternalStore(subscribeRecent, readRecentSnapshot, readServerRecent)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  const name = settings.name

  useEffect(() => {
    const socket = getSocket()
    const onRooms = (list: RoomSummary[]) => setRooms(list)
    socket.on("lobby:rooms", onRooms)
    socket.emit("lobby:list")
    return () => {
      socket.off("lobby:rooms", onRooms)
    }
  }, [])

  async function enter(response: Ack) {
    if (!response.ok) {
      setError(response.error)
      toast.error(response.error)
      return
    }
    saveSession(response.code, {
      token: response.token,
      playerId: response.playerId,
      name: response.name ?? name.trim(),
    })
    router.push(`/room/${response.code}`)
  }

  return (
    <main className="casino-bg min-h-dvh">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 lg:py-14">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.28em] text-[#e4c36a] uppercase">Private tables</p>
            <h1 className="font-display text-5xl text-[#f6f1e6] sm:text-6xl">Felt Friends</h1>
            <p className="mt-2 max-w-xl text-[#d9ccb4]">
              No-limit Texas Hold&apos;em for the group chat. Deal a room, share a short code, and play for chips.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        </header>

        <p className="rounded-2xl border border-[#e4c36a]/30 bg-[#e4c36a]/10 px-4 py-3 text-sm text-[#f6e7bf]">
          Play chips only. Felt Friends is not real-money gambling — nothing here can be cashed out.
        </p>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <section className="rounded-3xl border border-[#e4c36a]/40 bg-[#1a1408] p-5">
          <p className="text-xs tracking-[0.22em] text-[#e4c36a] uppercase">Practice table</p>
          <h2 className="font-display text-3xl text-[#f6f1e6]">Play with bots</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#d9ccb4]">
            One tap opens the standing practice table. Bluff Bot, Check Bot, and River Bot are already seated. They stay for the next hand. A restart rebuilds the same squad.
          </p>
          <div className="mt-4 space-y-3">
            <AvatarPicker value={settings.avatar} onChange={(avatar) => update({ avatar })} />
            <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <Label htmlFor="practice-name">Your name</Label>
              <Input
                id="practice-name"
                value={name}
                maxLength={16}
                placeholder="Your name"
                onChange={(event) => update({ name: event.target.value })}
              />
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                const trimmed = name.trim()
                if (!trimmed) {
                  setError("Type your name, then sit with the bots.")
                  return
                }
                if (loadSession(PRACTICE_CODE)) {
                  router.push(`/room/${PRACTICE_CODE}`)
                  return
                }
                setBusy(true)
                setError(null)
                void emitAck<Ack>("lobby:practice", { name: trimmed, avatar: settings.avatar })
                  .then(enter)
                  .finally(() => setBusy(false))
              }}
            >
              Play with bots
            </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="space-y-4 rounded-3xl border border-white/10 bg-[#141820]/90 p-5"
            onSubmit={(event) => {
              event.preventDefault()
              setBusy(true)
              void emitAck<Ack>("lobby:create", {
                name: name.trim(),
                avatar: settings.avatar,
                smallBlind: Number(sb),
                bigBlind: Number(bb),
                startingStack: Number(stack),
                actionTimeSec: Number(clock),
                mode,
                listed,
              })
                .then(enter)
                .finally(() => setBusy(false))
            }}
          >
            <h2 className="font-display text-2xl">Create a private room</h2>
            <p className="text-sm text-[#b7ab96]">For a friends night. Share the code when you are ready. Anyone with the code can join — treat it like a party invite.</p>
            <div className="space-y-1.5">
              <Label htmlFor="host-name">Your name</Label>
              <Input id="host-name" value={name} maxLength={16} required placeholder="Your name" onChange={(event) => update({ name: event.target.value })} />
            </div>
            <AvatarPicker value={settings.avatar} onChange={(avatar) => update({ avatar })} />
            <div>
              <Button type="button" variant="ghost" onClick={() => setAdvanced((open) => !open)}>
                {advanced ? "Hide advanced" : "Advanced"}
              </Button>
              {advanced ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-[#b7ab96]">Starting chips are what each player begins with. Time per decision is how long you get before the table checks or folds for you. Blinds are the small forced bets each hand.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Small blind" value={sb} onChange={setSb} />
                    <Field label="Big blind" value={bb} onChange={setBb} />
                    <Field label="Starting chips" value={stack} onChange={setStack} />
                    <Field label="Time per decision" value={clock} onChange={setClock} />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#b7ab96]">50/100 blinds, 10,000 starting chips, 25 seconds per decision.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "cash"} onChange={() => setMode("cash")} />
                Cash chips, rebuys allowed
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === "sng"} onChange={() => setMode("sng")} />
                Sit & go, winner takes the table
              </label>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="listed">List this room in the lobby</Label>
              <Switch id="listed" checked={listed} onCheckedChange={setListed} />
            </div>
            <Button type="submit" disabled={busy}>
              Create room
            </Button>
          </form>

          <form
            className="space-y-4 rounded-3xl border border-white/10 bg-[#141820]/90 p-5"
            onSubmit={(event) => {
              event.preventDefault()
              setBusy(true)
              void emitAck<Ack>("lobby:join", {
                code: code.trim().toUpperCase(),
                name: name.trim(),
                avatar: settings.avatar,
              })
                .then(enter)
                .finally(() => setBusy(false))
            }}
          >
            <h2 className="font-display text-2xl">Join with a code</h2>
            <p className="text-sm text-[#b7ab96]">A friend sends you a short code or invite link. Anyone with that code can sit down.</p>
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Your name</Label>
              <Input id="guest-name" value={name} maxLength={16} required placeholder="Your name" onChange={(event) => update({ name: event.target.value })} />
            </div>
            <AvatarPicker value={settings.avatar} onChange={(avatar) => update({ avatar })} />
            <div className="space-y-1.5">
              <Label htmlFor="room-code">Room code</Label>
              <Input
                id="room-code"
                value={code}
                maxLength={5}
                placeholder="K7Q2M"
                className="tracking-[0.3em] uppercase"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                Sit down
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void emitAck<Ack>("lobby:join", {
                    code: code.trim().toUpperCase(),
                    name: name.trim(),
                    avatar: settings.avatar,
                    spectate: true,
                  })
                    .then(enter)
                    .finally(() => setBusy(false))
                }}
              >
                Spectate
              </Button>
            </div>
            <div>
              <h3 className="mb-2 text-sm text-[#b7ab96]">Recent on this browser</h3>
              <div className="flex flex-wrap gap-2">
                {recent.length === 0 ? <p className="text-sm text-[#b7ab96]">None yet.</p> : null}
                {recent.map((room) => (
                  <Button key={room.code} type="button" variant="outline" onClick={() => setCode(room.code)}>
                    {room.code}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm text-[#b7ab96]">Open tables</h3>
              <ul className="space-y-2">
                {rooms.length === 0 ? <li className="text-sm text-[#b7ab96]">No listed rooms. Private codes stay unlisted.</li> : null}
                {rooms.map((room) => (
                  <li key={room.code} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <span>
                      <strong>{room.practice ? room.title : room.code}</strong>
                      <span className="text-[#b7ab96]">
                        {room.practice ? ` · ${room.code}` : ""} · {room.smallBlind}/{room.bigBlind} · {room.playerCount} seated
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (room.practice) {
                          if (loadSession(room.code)) {
                            router.push(`/room/${room.code}`)
                            return
                          }
                          const trimmed = name.trim()
                          if (!trimmed) {
                            setError("Type your name, then sit with the bots.")
                            return
                          }
                          setBusy(true)
                          void emitAck<Ack>("lobby:practice", { name: trimmed, avatar: settings.avatar })
                            .then(enter)
                            .finally(() => setBusy(false))
                          return
                        }
                        setCode(room.code)
                      }}
                    >
                      {room.practice ? "Sit down" : "Use"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </form>
        </div>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-[#b7ab96]">
      {label}
      <Input value={value} inputMode="numeric" onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

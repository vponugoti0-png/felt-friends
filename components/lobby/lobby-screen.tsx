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
import { readRecentSnapshot, readServerRecent, saveSession, subscribeRecent } from "@/lib/client/settings"
import { emitAck, getSocket } from "@/lib/client/socket"
import type { RoomSummary, TableMode } from "@/lib/game/protocol"

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
            <h2 className="font-display text-2xl">Open a table</h2>
            <div className="space-y-1.5">
              <Label htmlFor="host-name">Your name</Label>
              <Input id="host-name" value={name} maxLength={16} required placeholder="Ace" onChange={(event) => update({ name: event.target.value })} />
            </div>
            <AvatarPicker value={settings.avatar} onChange={(avatar) => update({ avatar })} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Small blind" value={sb} onChange={setSb} />
              <Field label="Big blind" value={bb} onChange={setBb} />
              <Field label="Stack" value={stack} onChange={setStack} />
              <Field label="Seconds" value={clock} onChange={setClock} />
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
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Your name</Label>
              <Input id="guest-name" value={name} maxLength={16} required placeholder="River" onChange={(event) => update({ name: event.target.value })} />
            </div>
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
                      <strong className="tracking-[0.18em]">{room.code}</strong>
                      <span className="text-[#b7ab96]">
                        {" "}
                        · {room.smallBlind}/{room.bigBlind} · {room.playerCount} seated
                      </span>
                    </span>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setCode(room.code)}>
                      Use
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

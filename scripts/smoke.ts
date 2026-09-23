import { io, type Socket } from "socket.io-client"

const base = process.env.SMOKE_URL ?? "http://127.0.0.1:3847"

type Ack = { ok: true; code?: string; token?: string; playerId?: string } | { ok: false; error: string }
type Update = {
  state: {
    handNumber: number
    phase: string
    you: { legal: { check: boolean; call: boolean; fold: boolean; canWager: boolean; minWager: number; maxWager: number } | null } | null
  }
  history: unknown[]
}

async function main() {
  const health = await fetch(`${base}/api/health`)
  if (!health.ok) throw new Error(`health ${health.status}`)
  const body = (await health.json()) as { ok?: boolean }
  if (!body.ok) throw new Error("health payload")

  const host = io(base, { transports: ["websocket"] })
  const guest = io(base, { transports: ["websocket"] })
  await Promise.all([waitConnect(host), waitConnect(guest)])

  const created = await ack(host, "lobby:create", { name: "Smoke", listed: false, actionTimeSec: 15 })
  if (!created.ok || !created.code) throw new Error("create failed")
  const joined = await ack(guest, "lobby:join", { code: created.code, name: "Pal" })
  if (!joined.ok) throw new Error("join failed")
  const bot = await ack(host, "host:add-bot", {})
  if (!bot.ok) throw new Error("bot failed")

  wire(host)
  wire(guest)

  const started = await ack(host, "host:start", {})
  if (!started.ok) throw new Error(`start failed: ${"error" in started ? started.error : ""}`)

  const finished = await waitForHand(host, 40_000)
  if (!finished) throw new Error("hand did not finish")
  host.close()
  guest.close()
  console.log(`smoke ok: room ${created.code} reached hand ${finished.handNumber} (${finished.phase})`)
}

function wire(socket: Socket) {
  let busy = false
  socket.on("table:update", async (payload: Update) => {
    const legal = payload.state.you?.legal
    if (!legal || busy) return
    busy = true
    try {
      if (legal.check) await ack(socket, "table:act", { type: "check" })
      else if (legal.call) await ack(socket, "table:act", { type: "call" })
      else if (legal.fold) await ack(socket, "table:act", { type: "fold" })
      else if (legal.canWager) {
        const amount = legal.maxWager < legal.minWager ? legal.maxWager : legal.minWager
        await ack(socket, "table:act", { type: "wager", amount })
      }
    } finally {
      busy = false
    }
  })
}

function waitForHand(socket: Socket, timeout: number) {
  return new Promise<{ handNumber: number; phase: string } | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout)
    const onUpdate = (payload: Update) => {
      if (payload.history.length >= 1 || payload.state.handNumber >= 2) {
        clearTimeout(timer)
        socket.off("table:update", onUpdate)
        resolve({ handNumber: payload.state.handNumber, phase: payload.state.phase })
      }
    }
    socket.on("table:update", onUpdate)
  })
}

function waitConnect(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timeout")), 8000)
    socket.on("connect", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function ack(socket: Socket, event: string, payload: unknown) {
  return new Promise<Ack>((resolve) => {
    socket.emit(event, payload, (response: Ack) => resolve(response))
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

import type { Server, Socket } from "socket.io"

import type { PlayerAction } from "@/lib/poker/hand"
import { RoomError, rooms } from "@/lib/game/rooms"
import type { CreateInput, JoinInput } from "@/lib/game/rooms"

interface SocketData {
  token?: string
  playerId?: string
  code?: string
}

type Ack = (payload: unknown) => void

const tails = new Map<string, Promise<void>>()

export function attachGameServer(io: Server) {
  io.on("connection", (socket: Socket) => {
    const client = socket as Socket & { data: SocketData }
    client.join("lobby")
    client.emit("lobby:rooms", rooms.listRooms())

    client.on("lobby:list", (ack?: Ack) => {
      const list = rooms.listRooms()
      client.emit("lobby:rooms", list)
      ack?.({ ok: true, rooms: list })
    })

    client.on("lobby:create", (payload: CreateInput, ack?: Ack) => {
      try {
        const result = rooms.create(payload ?? { name: "" })
        bind(client, result.code, result.token, result.playerId)
        ack?.({ ok: true, ...result })
        queueBroadcast(io, result.code)
        io.to("lobby").emit("lobby:rooms", rooms.listRooms())
      } catch (error) {
        ack?.({ ok: false, error: messageOf(error) })
      }
    })

    client.on("lobby:join", (payload: JoinInput, ack?: Ack) => {
      try {
        const result = rooms.join(payload)
        bind(client, result.code, result.token, result.playerId)
        ack?.({ ok: true, ...result })
        queueBroadcast(io, result.code)
        io.to("lobby").emit("lobby:rooms", rooms.listRooms())
      } catch (error) {
        ack?.({ ok: false, error: messageOf(error) })
      }
    })

    client.on("lobby:practice", (payload: { name?: string; avatar?: JoinInput["avatar"]; spectate?: boolean }, ack?: Ack) => {
      try {
        const result = rooms.joinPractice({
          name: payload?.name ?? "",
          avatar: payload?.avatar,
          spectate: payload?.spectate,
        })
        bind(client, result.code, result.token, result.playerId)
        ack?.({ ok: true, ...result })
        queueBroadcast(io, result.code)
        io.to("lobby").emit("lobby:rooms", rooms.listRooms())
      } catch (error) {
        ack?.({ ok: false, error: messageOf(error) })
      }
    })

    client.on("session:resume", (payload: { token?: string; takeover?: boolean }, ack?: Ack) => {
      try {
        if (!payload?.token) throw new RoomError("Missing session.")
        const result = rooms.resume(payload.token, { socketId: client.id, takeover: Boolean(payload.takeover) })
        if (result.conflict) {
          ack?.({
            ok: false,
            code: "already-seated",
            error: "You're already seated in another tab.",
          })
          return
        }
        if (result.displacedSocketId) {
          io.to(result.displacedSocketId).emit("table:displaced", {
            message: "Your seat moved to another tab. This tab is no longer playing that seat.",
          })
        }
        bind(client, result.code, payload.token, result.playerId)
        ack?.({ ok: true, ...result })
        queueBroadcast(io, result.code)
      } catch (error) {
        ack?.({ ok: false, error: messageOf(error) })
      }
    })

    client.on("table:act", (payload: PlayerAction, ack?: Ack) => {
      withSession(client, ack, (token) => {
        rooms.act(token, payload)
      })
    })

    client.on("table:sitout", (payload: { sittingOut?: boolean }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.setSittingOut(token, Boolean(payload?.sittingOut)))
    })

    client.on("table:rebuy", (_payload: unknown, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.rebuy(token))
    })

    client.on("table:sit", (payload: { seat?: number }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.sit(token, payload?.seat))
    })

    client.on("table:stand", (_payload: unknown, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.stand(token))
    })

    client.on("table:leave", (_payload: unknown, ack?: Ack) => {
      withSession(client, ack, (token) => {
        const code = client.data.code
        rooms.leave(token)
        if (code) queueBroadcast(io, code)
        client.leave(code ?? "")
        client.data = {}
      })
    })

    client.on("table:chat", (payload: { text?: string }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.chat(token, payload?.text ?? ""))
    })

    client.on("table:react", (payload: { emoji?: string }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.react(token, payload?.emoji ?? ""))
    })

    client.on("player:rename", (payload: { name?: string }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.rename(token, payload?.name ?? ""))
    })

    client.on("host:start", (_payload: unknown, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostStart(token))
    })

    client.on("host:pause", (payload: { paused?: boolean }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostPause(token, Boolean(payload?.paused)))
    })

    client.on("host:blinds", (payload: { smallBlind?: number; bigBlind?: number }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostBlinds(token, Number(payload?.smallBlind), Number(payload?.bigBlind)))
    })

    client.on("host:add-bot", (payload: { name?: string } | undefined, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostAddBot(token, payload?.name))
    })

    client.on("host:add-group", (_payload: unknown, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostAddReadyGroup(token))
    })

    client.on("host:clear-bots", (_payload: unknown, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostClearBots(token))
    })

    client.on("host:remove-bot", (payload: { playerId?: string }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostRemoveBot(token, payload?.playerId ?? ""))
    })

    client.on("host:kick", (payload: { playerId?: string }, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostKick(token, payload?.playerId ?? ""))
    })

    client.on("host:stop", (_payload: unknown, ack?: Ack) => {
      withSession(client, ack, (token) => rooms.hostStop(token))
    })

    client.on("disconnect", () => {
      if (client.data.token) {
        const code = client.data.code
        rooms.disconnect(client.data.token, client.id)
        if (code) queueBroadcast(io, code)
      }
    })
  })

  setInterval(() => {
    rooms.tick()
    const dirty = rooms.consumeDirty()
    for (const code of dirty.removed) {
      io.to(code).emit("table:closed", { message: "This table closed." })
    }
    for (const code of new Set([...dirty.updated, ...dirty.removed])) {
      if (!dirty.removed.includes(code)) queueBroadcast(io, code)
    }
    if (dirty.updated.length || dirty.removed.length) {
      io.to("lobby").emit("lobby:rooms", rooms.listRooms())
    }
  }, 200)
}

function withSession(socket: Socket & { data: SocketData }, ack: Ack | undefined, fn: (token: string) => void) {
  try {
    if (!socket.data.token) throw new RoomError("Join a table first.")
    fn(socket.data.token)
    ack?.({ ok: true })
    if (socket.data.code) queueBroadcast(ioFrom(socket), socket.data.code)
  } catch (error) {
    ack?.({ ok: false, error: messageOf(error) })
  }
}

function bind(socket: Socket & { data: SocketData }, code: string, token: string, playerId: string) {
  if (socket.data.code && socket.data.code !== code) socket.leave(socket.data.code)
  socket.data.token = token
  socket.data.playerId = playerId
  socket.data.code = code
  socket.join(code)
  socket.leave("lobby")
}

function queueBroadcast(io: Server, code: string) {
  const prev = tails.get(code) ?? Promise.resolve()
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const events = rooms.drainEvents(code)
      const sockets = await io.in(code).fetchSockets()
      for (const remote of sockets) {
        const data = remote.data as SocketData
        const snap = rooms.snapshot(code, data.playerId)
        if (!snap) continue
        remote.emit("table:update", { ...snap, events })
      }
    })
  tails.set(code, next)
}

function ioFrom(socket: Socket) {
  return socket.nsp.server
}

function messageOf(error: unknown) {
  if (error instanceof RoomError) return error.message
  if (error instanceof Error) return error.message
  return "Something went wrong at the table."
}

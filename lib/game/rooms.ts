import { randomBytes, randomInt, randomUUID } from "node:crypto"

import { formatChips } from "@/lib/poker/cards"
import { BOT_ROSTER, READY_GROUP, chooseBotAction, type BotStyle } from "@/lib/poker/bots"
import { secureDeck } from "@/lib/poker/deck"
import { cardKey } from "@/lib/poker/cards"
import { PokerHand, type HandResult, type PlayerAction } from "@/lib/poker/hand"
import { allowChat, moderateChat, sanitizeName } from "@/lib/game/moderation"
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  MAX_SEATS,
  PRACTICE_CODE,
  REACTIONS,
  type AnimEvent,
  type Avatar,
  type ChatMessage,
  type HandHistoryEntry,
  type BotBenchItem,
  type PublicPlayer,
  type RoomPhase,
  type RoomSummary,
  type TableMode,
  type TableSnapshot,
  type TableState,
} from "@/lib/game/protocol"

export class RoomError extends Error {}

interface Member {
  id: string
  token: string
  name: string
  avatar: Avatar
  seat: number | null
  stack: number
  sittingOut: boolean
  isBot: boolean
  connected: boolean
  joinedAt: number
  lastAction: string | null
  timeoutStrikes: number
  chatTimes: number[]
  mutedUntil: number
  lastReactionAt: number
  holder: string | null
  botStyle?: BotStyle
  removeAfterHand: boolean
  standAfterHand: boolean
  eliminated: boolean
}

interface Room {
  code: string
  hostId: string
  smallBlind: number
  bigBlind: number
  startingStack: number
  actionTimeSec: number
  mode: TableMode
  listed: boolean
  practice: boolean
  paused: boolean
  stopAfterHand: boolean
  phase: RoomPhase
  members: Member[]
  buttonSeat: number | null
  hand: PokerHand | null
  handNumber: number
  turnEndsAt: number | null
  botActAt: number | null
  runoutAt: number | null
  showdownUntil: number | null
  betweenUntil: number | null
  history: HandHistoryEntry[]
  chat: ChatMessage[]
  banner: string | null
  createdAt: number
  updatedAt: number
  lastHumanAt: number
  version: number
  pendingEvents: AnimEvent[]
  championId: string | null
  pendingBlinds: { smallBlind: number; bigBlind: number } | null
}

export interface CreateInput {
  name: string
  avatar?: Partial<Avatar>
  smallBlind?: number
  bigBlind?: number
  startingStack?: number
  actionTimeSec?: number
  mode?: TableMode
  listed?: boolean
}

export interface JoinInput {
  code: string
  name: string
  avatar?: Partial<Avatar>
  spectate?: boolean
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const SHOWDOWN_MS = 3200
const RUNOUT_MS = 780
const BETWEEN_MS = 700
const BOT_MIN_MS = 650
const BOT_MAX_MS = 1500
const SITOUT_MS = 320
const IDLE_MS = 20 * 60 * 1000
const MAX_ROOMS = 40

export class RoomManager {
  private rooms = new Map<string, Room>()
  private tokens = new Map<string, { code: string; playerId: string }>()
  private dirty = new Set<string>()
  private removed = new Set<string>()
  now = Date.now()
  manualClock = false

  setClock(now: number) {
    this.manualClock = true
    this.now = now
  }

  tick(now?: number) {
    if (now !== undefined) this.now = now
    else if (!this.manualClock) this.now = Date.now()
    for (const room of this.rooms.values()) {
      this.pump(room)
    }
    this.gc()
  }

  consumeDirty(): { updated: string[]; removed: string[] } {
    const updated = [...this.dirty]
    const removed = [...this.removed]
    this.dirty.clear()
    this.removed.clear()
    return { updated, removed }
  }

  listRooms(): RoomSummary[] {
    this.ensurePractice()
    return [...this.rooms.values()]
      .filter((room) => room.listed)
      .map((room) => this.summary(room))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  drainEvents(code: string): AnimEvent[] {
    const room = this.rooms.get(code.toUpperCase())
    if (!room) return []
    return room.pendingEvents.splice(0, room.pendingEvents.length)
  }

  snapshot(code: string, playerId?: string | null): TableSnapshot | null {
    const room = this.rooms.get(code.toUpperCase())
    if (!room) return null
    return {
      state: this.tableState(room, playerId),
      events: room.pendingEvents.slice(),
      chat: room.chat.slice(-80),
      history: room.history.slice(-20),
    }
  }

  create(input: CreateInput) {
    this.stamp()
    if (this.rooms.size >= MAX_ROOMS) throw new RoomError("The casino is full. Try again in a minute.")
    const name = this.requireName(input.name)
    const blinds = normalizeBlinds(input.smallBlind ?? 50, input.bigBlind ?? 100)
    const startingStack = normalizeStack(input.startingStack ?? 10_000, blinds.bigBlind)
    const actionTimeSec = normalizeClock(input.actionTimeSec ?? 25)
    const mode: TableMode = input.mode === "sng" ? "sng" : "cash"
    const room: Room = {
      code: this.freshCode(),
      hostId: "",
      smallBlind: blinds.smallBlind,
      bigBlind: blinds.bigBlind,
      startingStack,
      actionTimeSec,
      mode,
      listed: Boolean(input.listed),
      practice: false,
      paused: false,
      stopAfterHand: false,
      phase: "lobby",
      members: [],
      buttonSeat: null,
      hand: null,
      handNumber: 0,
      turnEndsAt: null,
      botActAt: null,
      runoutAt: null,
      showdownUntil: null,
      betweenUntil: null,
      history: [],
      chat: [],
      banner: "Share the room code and deal when the table is ready.",
      createdAt: this.now,
      updatedAt: this.now,
      lastHumanAt: this.now,
      version: 1,
      pendingEvents: [],
      championId: null,
      pendingBlinds: null,
    }
    const host = this.makeMember(name, normalizeAvatar(input.avatar), false)
    host.seat = 0
    host.stack = startingStack
    host.connected = true
    room.hostId = host.id
    room.members.push(host)
    this.rooms.set(room.code, room)
    this.tokens.set(host.token, { code: room.code, playerId: host.id })
    this.touch(room)
    return { code: room.code, token: host.token, playerId: host.id, name: host.name }
  }

  join(input: JoinInput) {
    this.stamp()
    const room = this.requireRoom(input.code)
    const name = this.requireName(input.name)
    const member = this.makeMember(name, normalizeAvatar(input.avatar), false)
    member.connected = true
    if (!input.spectate) {
      const seat = this.firstOpenSeat(room)
      if (seat === null) throw new RoomError("Every seat is taken. Join as a spectator.")
      member.seat = seat
      member.stack = room.startingStack
    }
    room.members.push(member)
    this.tokens.set(member.token, { code: room.code, playerId: member.id })
    room.lastHumanAt = this.now
    this.adoptHost(room, member)
    this.note(room, `${member.name} ${member.seat === null ? "is watching" : "sits down"}.`)
    this.touch(room)
    return { code: room.code, token: member.token, playerId: member.id, name: member.name, seat: member.seat }
  }

  joinPractice(input: { name: string; avatar?: Partial<Avatar>; spectate?: boolean }) {
    this.stamp()
    this.ensurePractice()
    return this.join({ code: PRACTICE_CODE, name: input.name, avatar: input.avatar, spectate: input.spectate })
  }

  resume(token: string, claim?: { socketId: string; takeover?: boolean }) {
    this.stamp()
    const found = this.tokens.get(token)
    if (!found) throw new RoomError("That seat session expired.")
    const room = this.requireRoom(found.code)
    const member = this.requireMember(room, found.playerId)
    const otherTab =
      Boolean(claim?.socketId) &&
      Boolean(member.holder) &&
      member.holder !== claim?.socketId &&
      member.connected &&
      !member.isBot
    if (otherTab && !claim?.takeover) {
      return {
        conflict: true as const,
        code: room.code,
        playerId: member.id,
        name: member.name,
        displacedSocketId: null as string | null,
      }
    }
    const displacedSocketId = otherTab && claim?.takeover ? member.holder : null
    if (claim?.socketId) member.holder = claim.socketId
    member.connected = true
    if (!member.isBot) room.lastHumanAt = this.now
    this.touch(room)
    return {
      conflict: false as const,
      code: room.code,
      playerId: member.id,
      name: member.name,
      displacedSocketId,
    }
  }

  disconnect(token: string, socketId?: string) {
    this.stamp()
    const found = this.tokens.get(token)
    if (!found) return
    const room = this.rooms.get(found.code)
    if (!room) return
    const member = room.members.find((item) => item.id === found.playerId)
    if (!member || member.isBot) return
    if (socketId && member.holder && member.holder !== socketId) return
    member.connected = false
    member.holder = null
    if (room.members.some((item) => !item.isBot && item.connected)) room.lastHumanAt = this.now
    this.touch(room)
  }

  act(token: string, action: PlayerAction) {
    this.stamp()
    const { room, member } = this.session(token)
    if (!room.hand || room.phase !== "hand") throw new RoomError("The hand isn't open for bets.")
    if (member.sittingOut) throw new RoomError("You're sitting out.")
    room.hand.act(member.id, action)
    member.timeoutStrikes = 0
    this.noteAction(room, member.id)
    this.touch(room)
    this.afterMutation(room)
  }

  setSittingOut(token: string, sittingOut: boolean) {
    this.stamp()
    const { room, member } = this.session(token)
    if (member.eliminated) throw new RoomError("You're out of this sit & go.")
    member.sittingOut = sittingOut
    member.timeoutStrikes = 0
    if (sittingOut && room.hand && room.phase === "hand" && room.hand.toActId === member.id) {
      room.botActAt = this.now + SITOUT_MS
    }
    this.note(room, sittingOut ? `${member.name} sits out.` : `${member.name} is back in.`)
    if (!sittingOut && (room.phase === "between" || room.phase === "lobby") && !room.paused) {
      this.scheduleNext(room)
    }
    this.touch(room)
  }

  rebuy(token: string) {
    this.stamp()
    const { room, member } = this.session(token)
    if (room.mode !== "cash") throw new RoomError("This sit & go doesn't allow rebuys.")
    if (member.stack > 0) throw new RoomError("You still have chips.")
    if (room.hand?.players.some((player) => player.id === member.id) && room.phase === "hand") {
      throw new RoomError("Wait for the hand to finish.")
    }
    member.stack = room.startingStack
    member.eliminated = false
    member.sittingOut = false
    this.note(room, `${member.name} rebuys for ${formatChips(room.startingStack)}.`)
    this.scheduleNext(room)
    this.touch(room)
  }

  sit(token: string, seat?: number) {
    this.stamp()
    const { room, member } = this.session(token)
    if (member.seat !== null) throw new RoomError("You're already seated.")
    if (member.eliminated) throw new RoomError("You're out of this sit & go.")
    if (room.phase === "hand" || room.phase === "showdown") {
      throw new RoomError("Wait for the next hand to take a seat.")
    }
    const open = seat ?? this.firstOpenSeat(room)
    if (open === null || open < 0 || open >= MAX_SEATS) throw new RoomError("That seat isn't open.")
    if (room.members.some((item) => item.seat === open)) throw new RoomError("That seat is taken.")
    member.seat = open
    member.standAfterHand = false
    member.removeAfterHand = false
    if (member.stack <= 0) member.stack = room.startingStack
    this.note(room, `${member.name} takes seat ${open + 1}.`)
    this.scheduleNext(room)
    this.touch(room)
  }

  stand(token: string) {
    this.stamp()
    const { room, member } = this.session(token)
    if (member.seat === null) return
    if (room.hand?.players.some((player) => player.id === member.id && !player.folded) && room.phase !== "lobby") {
      member.sittingOut = true
      member.standAfterHand = true
      if (room.hand && room.hand.toActId === member.id) room.botActAt = this.now + SITOUT_MS
      this.note(room, `${member.name} will stand up after this hand.`)
      this.touch(room)
      return
    }
    member.seat = null
    member.sittingOut = false
    this.note(room, `${member.name} steps away from the table.`)
    this.touch(room)
  }

  leave(token: string) {
    this.stamp()
    const { room, member } = this.session(token)
    this.removeMember(room, member, true)
    this.tokens.delete(token)
  }

  rename(token: string, name: string) {
    this.stamp()
    const { room, member } = this.session(token)
    member.name = this.requireName(name)
    this.touch(room)
  }

  chat(token: string, text: string) {
    this.stamp()
    const { room, member } = this.session(token)
    const gate = allowChat(member.chatTimes, this.now, member.mutedUntil)
    if (!gate.ok) {
      if (gate.mutedUntil) member.mutedUntil = gate.mutedUntil
      throw new RoomError(gate.error)
    }
    const moderated = moderateChat(text)
    if (!moderated.ok) throw new RoomError(moderated.error)
    member.chatTimes = [...member.chatTimes.filter((stamp) => this.now - stamp < 10_000), this.now]
    const message: ChatMessage = {
      id: randomUUID(),
      playerId: member.id,
      name: member.name,
      text: moderated.text,
      at: this.now,
      spectator: member.seat === null,
    }
    room.chat.push(message)
    if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100)
    this.touch(room)
  }

  react(token: string, emoji: string) {
    this.stamp()
    const { room, member } = this.session(token)
    if (!REACTIONS.includes(emoji)) throw new RoomError("That reaction isn't on the table.")
    if (this.now - member.lastReactionAt < 1200) throw new RoomError("Easy on the emojis.")
    member.lastReactionAt = this.now
    room.pendingEvents.push({ type: "reaction", playerId: member.id, emoji, id: randomUUID() })
    this.touch(room)
  }

  hostStart(token: string) {
    this.stamp()
    const { room, member } = this.host(token)
    if (room.phase === "finished") throw new RoomError("This sit & go is over.")
    if (room.phase === "hand" || room.phase === "showdown") throw new RoomError("A hand is already running.")
    room.paused = false
    room.stopAfterHand = false
    void member
    if (!this.startHand(room)) throw new RoomError("Need at least two players with chips who aren't sitting out.")
    this.touch(room)
  }

  hostPause(token: string, paused: boolean) {
    this.stamp()
    const { room } = this.host(token)
    room.paused = paused
    if (paused) {
      room.betweenUntil = null
      this.note(room, "The host paused between hands.")
    } else {
      this.note(room, "Play resumes.")
      this.scheduleNext(room)
    }
    this.touch(room)
  }

  hostBlinds(token: string, smallBlind: number, bigBlind: number) {
    this.stamp()
    const { room } = this.host(token)
    const blinds = normalizeBlinds(smallBlind, bigBlind)
    if (room.hand && (room.phase === "hand" || room.phase === "showdown")) {
      room.pendingBlinds = blinds
      this.note(room, `Blinds change to ${blinds.smallBlind}/${blinds.bigBlind} next hand.`)
    } else {
      room.smallBlind = blinds.smallBlind
      room.bigBlind = blinds.bigBlind
      this.note(room, `Blinds are now ${blinds.smallBlind}/${blinds.bigBlind}.`)
    }
    this.touch(room)
  }

  hostAddBot(token: string, name?: string) {
    this.stamp()
    const { room } = this.host(token)
    const bot = this.seatBot(room, name)
    this.note(room, `${bot.name} sits down. Bots stay for the next hand.`)
    this.scheduleNext(room)
    this.touch(room)
    return { playerId: bot.id }
  }

  hostAddReadyGroup(token: string) {
    this.stamp()
    const { room } = this.host(token)
    const missing = READY_GROUP.names.filter((name) => !this.botSeated(room, name))
    if (missing.length === 0) throw new RoomError("The ready group is already seated.")
    const added: string[] = []
    for (const name of missing) {
      if (this.firstOpenSeat(room) === null) break
      added.push(this.seatBot(room, name).name)
    }
    if (added.length === 0) throw new RoomError("No open seat for the ready group.")
    this.note(room, `${READY_GROUP.name} sits down (${added.join(", ")}). Bots stay for the next hand.`)
    this.scheduleNext(room)
    this.touch(room)
    return { added }
  }

  hostClearBots(token: string) {
    this.stamp()
    const { room } = this.host(token)
    const bots = room.members.filter((member) => member.isBot && member.seat !== null)
    if (bots.length === 0) throw new RoomError("No bots to clear.")
    for (const bot of [...bots]) this.removeMember(room, bot, false)
    this.note(room, "Bots cleared. Add the ready group again whenever you want them back.")
    this.touch(room)
  }

  hostRemoveBot(token: string, playerId: string) {
    this.stamp()
    const { room } = this.host(token)
    const bot = room.members.find((member) => member.id === playerId && member.isBot)
    if (!bot) throw new RoomError("That bot isn't at the table.")
    this.removeMember(room, bot, false)
  }

  hostKick(token: string, playerId: string) {
    this.stamp()
    const { room, member } = this.host(token)
    const target = room.members.find((item) => item.id === playerId)
    if (!target) throw new RoomError("That player isn't here.")
    if (target.id === member.id) throw new RoomError("You can't kick yourself.")
    this.removeMember(room, target, true)
    this.note(room, `${target.name} was asked to leave.`)
  }

  hostStop(token: string) {
    this.stamp()
    const { room } = this.host(token)
    if (room.phase === "hand" || room.phase === "showdown") {
      room.stopAfterHand = true
      room.paused = true
      this.note(room, "The table will stop after this hand.")
      this.touch(room)
      return
    }
    this.enterLobby(room)
    this.touch(room)
  }

  private startHand(room: Room): boolean {
    if (room.hand || room.paused || room.phase === "finished") return false
    const eligible = this.eligible(room)
    if (eligible.length < 2) {
      room.betweenUntil = null
      if (room.mode === "sng" && room.handNumber > 0 && this.contenders(room).length <= 1) {
        this.finishSng(room)
      }
      return false
    }
    if (room.pendingBlinds) {
      room.smallBlind = room.pendingBlinds.smallBlind
      room.bigBlind = room.pendingBlinds.bigBlind
      room.pendingBlinds = null
    }
    const buttonSeat =
      room.handNumber === 0 || room.buttonSeat === null
        ? (eligible.find((member) => member.id === room.hostId)?.seat ?? eligible[0].seat ?? 0)
        : nextSeat(room.buttonSeat, eligible.map((member) => member.seat ?? 0))
    room.buttonSeat = buttonSeat
    room.handNumber += 1
    for (const member of room.members) member.lastAction = null
    const hand = new PokerHand({
      seats: eligible.map((member) => ({
        id: member.id,
        seat: member.seat!,
        name: member.name,
        stack: member.stack,
        isBot: member.isBot,
      })),
      buttonSeat,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      deck: secureDeck(),
    })
    hand.start()
    room.hand = hand
    room.phase = "hand"
    room.showdownUntil = null
    room.betweenUntil = null
    room.banner = `Hand ${room.handNumber}`
    room.pendingEvents.push({ type: "deal-hole" })
    for (const entry of hand.actionLog) {
      const member = room.members.find((item) => item.id === entry.playerId)
      if (member && entry.type === "blind") member.lastAction = entry.text.replace(`${member.name} `, "")
    }
    this.afterMutation(room)
    return true
  }

  private afterMutation(room: Room) {
    const hand = room.hand
    if (!hand) return
    if (hand.phase === "complete") {
      this.enterShowdown(room, hand.result!)
      return
    }
    if (hand.phase === "between-streets") {
      room.turnEndsAt = null
      room.botActAt = null
      room.runoutAt = this.now + RUNOUT_MS
      room.pendingEvents.push({ type: "gather" })
      return
    }
    this.armTurn(room)
  }

  private armTurn(room: Room) {
    const hand = room.hand
    if (!hand || !hand.toActId) return
    room.runoutAt = null
    const member = room.members.find((item) => item.id === hand.toActId)
    room.turnEndsAt = this.now + room.actionTimeSec * 1000
    if (!member) return
    if (member.sittingOut) room.botActAt = this.now + SITOUT_MS
    else if (member.isBot) room.botActAt = this.now + BOT_MIN_MS + randomInt(BOT_MAX_MS - BOT_MIN_MS)
    else room.botActAt = null
  }

  private pump(room: Room) {
    for (let step = 0; step < 6; step++) {
      if (!this.step(room)) break
      this.touch(room)
    }
  }

  private step(room: Room): boolean {
    const hand = room.hand
    if (room.phase === "hand" && hand) {
      if (hand.phase === "complete") {
        this.enterShowdown(room, hand.result!)
        return true
      }
      if (hand.phase === "between-streets" && room.runoutAt && this.now >= room.runoutAt) {
        const before = hand.board.length
        hand.dealNext()
        room.pendingEvents.push({ type: "deal-board", count: hand.board.length - before })
        this.afterMutation(room)
        return true
      }
      if (hand.phase === "betting" && room.botActAt && this.now >= room.botActAt) {
        const member = room.members.find((item) => item.id === hand.toActId)
        if (member && (member.isBot || member.sittingOut)) {
          this.autoAct(room, member, member.sittingOut && !member.isBot)
          return true
        }
        room.botActAt = null
      }
      if (hand.phase === "betting" && room.turnEndsAt && this.now >= room.turnEndsAt) {
        const member = room.members.find((item) => item.id === hand.toActId)
        if (member) this.autoAct(room, member, true)
        return true
      }
    }
    if (room.phase === "showdown" && room.showdownUntil && this.now >= room.showdownUntil) {
      this.leaveShowdown(room)
      return true
    }
    if ((room.phase === "between" || room.phase === "lobby") && room.betweenUntil && this.now >= room.betweenUntil) {
      room.betweenUntil = null
      return this.startHand(room)
    }
    return false
  }

  private autoAct(room: Room, member: Member, fromTimeout: boolean) {
    const hand = room.hand
    if (!hand || hand.toActId !== member.id || hand.phase !== "betting") return
    const legal = hand.legalActions(member.id)
    let action: PlayerAction
    if (member.isBot && !member.sittingOut && member.botStyle) {
      const hp = hand.players.find((player) => player.id === member.id)
      if (hp?.hole) {
        action = chooseBotAction(
          {
            hole: hp.hole,
            board: hand.board,
            street: hand.street,
            pot: hand.potTotal,
            legal,
            bigBlind: hand.bigBlind,
          },
          member.botStyle,
        )
      } else {
        action = legal.check ? { type: "check" } : { type: "fold" }
      }
    } else if (legal.check) {
      action = { type: "check" }
    } else if (legal.fold) {
      action = { type: "fold" }
    } else if (legal.call) {
      action = { type: "call" }
    } else {
      return
    }
    try {
      hand.act(member.id, action)
    } catch {
      if (hand.phase !== "betting" || hand.toActId !== member.id) return
      const fallback = hand.legalActions(member.id)
      if (fallback.check) hand.act(member.id, { type: "check" })
      else if (fallback.fold) hand.act(member.id, { type: "fold" })
      else return
    }
    if (fromTimeout && !member.isBot) {
      member.timeoutStrikes += 1
      if (member.timeoutStrikes >= 2) {
        member.sittingOut = true
        this.note(room, `${member.name} is sitting out after timing out.`)
      }
    }
    this.noteAction(room, member.id)
    this.afterMutation(room)
  }

  private noteAction(room: Room, playerId: string) {
    const hand = room.hand
    const member = room.members.find((item) => item.id === playerId)
    if (!hand || !member) return
    const last = [...hand.actionLog].reverse().find((entry) => entry.playerId === playerId && entry.type !== "blind")
    if (!last) return
    member.lastAction = last.text.replace(`${member.name} `, "")
    const seat = member.seat ?? 0
    if (last.type === "fold") room.pendingEvents.push({ type: "fold", seat })
    else if (last.type === "check") room.pendingEvents.push({ type: "check", seat })
    else if (last.type === "call" || last.type === "bet" || last.type === "raise" || last.type === "allin") {
      const hp = hand.players.find((player) => player.id === playerId)
      room.pendingEvents.push({
        type: "bet",
        seat,
        amount: last.amount,
        allIn: last.type === "allin" || Boolean(hp?.allIn),
      })
    }
  }

  private enterShowdown(room: Room, result: HandResult) {
    const hand = room.hand
    if (!hand || room.phase === "showdown") return
    room.phase = "showdown"
    room.turnEndsAt = null
    room.botActAt = null
    room.runoutAt = null
    room.showdownUntil = this.now + SHOWDOWN_MS
    for (const hp of hand.players) {
      const member = room.members.find((item) => item.id === hp.id)
      if (!member) continue
      member.stack = hp.stack
      member.lastAction = null
      if (member.stack === 0) {
        member.sittingOut = true
        if (room.mode === "sng") member.eliminated = true
        this.note(room, `${member.name} is busted and sits out until a rebuy.`)
      }
    }
    const pot = result.payouts.reduce((sum, payout) => sum + payout.amount, 0)
    room.history.push({
      handNumber: room.handNumber,
      board: result.board,
      pot,
      reason: result.reason,
      winners: result.payouts.map((payout) => ({
        name: payout.name,
        amount: payout.amount,
        handName: payout.handName,
      })),
      players: hand.players.map((player) => ({
        name: player.name,
        hole: result.revealed.find((shown) => shown.playerId === player.id)?.hole ?? null,
        folded: player.folded,
        net: player.stack - player.startingStack,
      })),
      endedAt: this.now,
    })
    if (room.history.length > 30) room.history.splice(0, room.history.length - 30)
    room.banner = describeResult(result)
    for (const payout of result.payouts) {
      room.pendingEvents.push({
        type: "win",
        seat: payout.seat,
        amount: payout.amount,
        handName: payout.handName,
        name: payout.name,
      })
    }
  }

  private leaveShowdown(room: Room) {
    room.hand = null
    room.showdownUntil = null
    this.applyDepartures(room)
    if (room.stopAfterHand) {
      this.enterLobby(room)
      return
    }
    if (room.mode === "sng" && this.contenders(room).length <= 1) {
      this.finishSng(room)
      return
    }
    room.phase = "between"
    if (room.paused || this.eligible(room).length < 2) {
      room.betweenUntil = null
      if (this.eligible(room).length < 2) {
        room.banner = "Waiting for two players with chips."
      }
      return
    }
    room.betweenUntil = this.now + BETWEEN_MS
  }

  private finishSng(room: Room) {
    const winner = this.contenders(room)[0] ?? room.members.find((member) => member.stack > 0)
    room.phase = "finished"
    room.championId = winner?.id ?? null
    room.banner = winner ? `${winner.name} wins the sit & go.` : "Sit & go complete."
    room.betweenUntil = null
    room.hand = null
  }

  private enterLobby(room: Room) {
    room.phase = "lobby"
    room.paused = false
    room.stopAfterHand = false
    room.hand = null
    room.betweenUntil = null
    room.turnEndsAt = null
    room.banner = "Game stopped. Stacks stay — deal again when you're ready."
  }

  private applyDepartures(room: Room) {
    const leaving = room.members.filter((member) => member.removeAfterHand || member.standAfterHand)
    for (const member of leaving) {
      if (member.removeAfterHand) {
        if (!member.isBot) this.tokens.delete(member.token)
        room.members = room.members.filter((item) => item.id !== member.id)
        if (room.hostId === member.id) this.passHost(room)
      } else if (member.standAfterHand) {
        member.seat = null
        member.sittingOut = false
        member.standAfterHand = false
      }
    }
  }

  private removeMember(room: Room, member: Member, dropToken: boolean) {
    const inHand = room.hand?.players.some((player) => player.id === member.id && !player.folded)
    if (inHand && room.hand && room.phase === "hand") {
      room.hand.forceFold(member.id)
      member.removeAfterHand = true
      member.sittingOut = true
      this.noteAction(room, member.id)
      this.afterMutation(room)
      this.note(room, `${member.name} leaves the hand.`)
      this.touch(room)
      return
    }
    if (inHand && room.phase === "showdown") {
      member.removeAfterHand = true
      this.touch(room)
      return
    }
    room.members = room.members.filter((item) => item.id !== member.id)
    if (dropToken) this.tokens.delete(member.token)
    if (room.hostId === member.id) this.passHost(room)
    this.note(room, `${member.name} left.`)
    if (!room.members.some((item) => !item.isBot)) {
      if (room.practice) {
        room.hostId = ""
        this.touch(room)
        return
      }
      this.rooms.delete(room.code)
      this.removed.add(room.code)
      this.dirty.add(room.code)
      return
    }
    this.touch(room)
  }

  private passHost(room: Room) {
    const next = room.members.find((member) => !member.isBot)
    if (!next) {
      room.hostId = ""
      return
    }
    room.hostId = next.id
    this.note(room, `${next.name} is the new host.`)
  }

  private adoptHost(room: Room, member: Member) {
    if (member.isBot || member.seat === null) return
    const host = room.members.find((item) => item.id === room.hostId)
    if (host && !host.isBot) return
    room.hostId = member.id
  }

  private scheduleNext(room: Room) {
    if (room.paused || room.phase !== "between") return
    if (this.eligible(room).length < 2) {
      room.betweenUntil = null
      return
    }
    room.betweenUntil = this.now + BETWEEN_MS
  }

  private eligible(room: Room) {
    return room.members.filter(
      (member) =>
        member.seat !== null &&
        member.stack > 0 &&
        !member.sittingOut &&
        !member.removeAfterHand &&
        !member.eliminated,
    )
  }

  private contenders(room: Room) {
    return room.members.filter((member) => member.seat !== null && member.stack > 0 && !member.eliminated)
  }

  private tableState(room: Room, playerId?: string | null): TableState {
    const hand = room.hand
    const youMember = playerId ? room.members.find((member) => member.id === playerId) ?? null : null
    const revealed = new Map(hand?.result?.revealed.map((item) => [item.playerId, item]) ?? [])
    const players: PublicPlayer[] = room.members
      .filter((member) => member.seat !== null)
      .sort((a, b) => a.seat! - b.seat!)
      .map((member) => {
        const hp = hand?.players.find((player) => player.id === member.id)
        const show = revealed.get(member.id)
        const hole = show?.hole ?? null
        return {
          id: member.id,
          seat: member.seat!,
          name: member.name,
          avatar: member.avatar,
          stack: hp ? hp.stack : member.stack,
          streetBet: hp?.streetBet ?? 0,
          folded: hp?.folded ?? false,
          allIn: hp?.allIn ?? false,
          sittingOut: member.sittingOut,
          isBot: member.isBot,
          isHost: member.id === room.hostId,
          connected: member.connected || member.isBot,
          isDealer: hand ? member.seat === hand.buttonSeat : member.seat === room.buttonSeat,
          isSmallBlind: hand ? member.id === hand.sbPlayerId : false,
          isBigBlind: hand ? member.id === hand.bbPlayerId : false,
          hasCards: Boolean(hp?.hole) && !hp?.folded,
          hole,
          isTurn: hand?.toActId === member.id && room.phase === "hand",
          lastAction: member.lastAction,
          handName: show?.handName,
          bestFive: show ? show.bestFive.map(cardKey) : undefined,
          eliminated: member.eliminated,
        }
      })

    const hpYou = youMember ? hand?.players.find((player) => player.id === youMember.id) : undefined
    const youHole = hpYou?.hole ?? revealed.get(youMember?.id ?? "")?.hole ?? null

    return {
      code: room.code,
      phase: room.phase,
      mode: room.mode,
      street: hand?.street ?? null,
      handNumber: room.handNumber,
      pot: hand?.potTotal ?? 0,
      community: hand?.board.slice() ?? [],
      players,
      spectators: room.members
        .filter((member) => member.seat === null)
        .map((member) => ({ id: member.id, name: member.name, avatar: member.avatar })),
      buttonSeat: hand?.buttonSeat ?? room.buttonSeat,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      startingStack: room.startingStack,
      actionTimeSec: room.actionTimeSec,
      turnEndsAt: room.phase === "hand" ? room.turnEndsAt : null,
      serverNow: this.now,
      paused: room.paused,
      hostId: room.hostId,
      listed: room.listed,
      banner: room.banner,
      winners:
        room.phase === "showdown"
          ? (hand?.result?.payouts.map((payout) => ({
              playerId: payout.playerId,
              name: payout.name,
              seat: payout.seat,
              amount: payout.amount,
              handName: payout.handName,
            })) ?? [])
          : [],
      you: youMember
        ? {
            id: youMember.id,
            seat: youMember.seat,
            isHost: youMember.id === room.hostId,
            isSpectator: youMember.seat === null,
            hole: youHole,
            legal:
              hand && room.phase === "hand" && hand.toActId === youMember.id
                ? hand.legalActions(youMember.id)
                : null,
            sittingOut: youMember.sittingOut,
            stack: hpYou ? hpYou.stack : youMember.stack,
          }
        : null,
      maxSeats: MAX_SEATS,
      championName: room.members.find((member) => member.id === room.championId)?.name ?? null,
      practice: room.practice,
      botBench: this.botBench(room),
    }
  }

  private summary(room: Room): RoomSummary {
    return {
      code: room.code,
      mode: room.mode,
      phase: room.phase,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      playerCount: room.members.filter((member) => member.seat !== null).length,
      spectatorCount: room.members.filter((member) => member.seat === null).length,
      handNumber: room.handNumber,
      createdAt: room.createdAt,
      practice: room.practice,
      title: room.practice
        ? room.members.some((member) => member.isBot && member.seat !== null)
          ? "Practice · bots ready"
          : "Practice table"
        : "Private table",
    }
  }

  private gc() {
    for (const room of this.rooms.values()) {
      if (room.practice) continue
      const humans = room.members.some((member) => !member.isBot && member.connected)
      if (!humans && this.now - room.lastHumanAt > IDLE_MS) {
        this.rooms.delete(room.code)
        this.removed.add(room.code)
        this.dirty.add(room.code)
      }
    }
  }

  private firstOpenSeat(room: Room): number | null {
    const taken = new Set(room.members.map((member) => member.seat).filter((seat): seat is number => seat !== null))
    for (let seat = 0; seat < MAX_SEATS; seat++) {
      if (!taken.has(seat)) return seat
    }
    return null
  }

  private makeMember(name: string, avatar: Avatar, isBot: boolean): Member {
    return {
      id: randomUUID(),
      token: randomBytes(24).toString("hex"),
      name,
      avatar,
      seat: null,
      stack: 0,
      sittingOut: false,
      isBot,
      connected: isBot,
      joinedAt: this.now,
      lastAction: null,
      timeoutStrikes: 0,
      chatTimes: [],
      mutedUntil: 0,
      lastReactionAt: 0,
      holder: null,
      removeAfterHand: false,
      standAfterHand: false,
      eliminated: false,
    }
  }

  private session(token: string) {
    this.stamp()
    const found = this.tokens.get(token)
    if (!found) throw new RoomError("Join the table again — your session expired.")
    const room = this.requireRoom(found.code)
    const member = this.requireMember(room, found.playerId)
    return { room, member }
  }

  private host(token: string) {
    const session = this.session(token)
    if (session.member.id !== session.room.hostId) throw new RoomError("Only the host can do that.")
    return session
  }

  private requireRoom(code: string) {
    const room = this.rooms.get(code.trim().toUpperCase())
    if (!room) throw new RoomError("No table with that code.")
    return room
  }

  private requireMember(room: Room, playerId: string) {
    const member = room.members.find((item) => item.id === playerId)
    if (!member) throw new RoomError("You're not at this table.")
    return member
  }

  private requireName(raw: string) {
    const name = sanitizeName(raw)
    if (!name) throw new RoomError("Use a display name, 2–16 letters or numbers.")
    return name
  }

  private freshCode() {
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = ""
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
      if (code !== PRACTICE_CODE && !this.rooms.has(code)) return code
    }
    throw new RoomError("Couldn't mint a room code.")
  }

  private ensurePractice() {
    if (this.rooms.has(PRACTICE_CODE)) return
    const room: Room = {
      code: PRACTICE_CODE,
      hostId: "",
      smallBlind: 50,
      bigBlind: 100,
      startingStack: 10_000,
      actionTimeSec: 25,
      mode: "cash",
      listed: true,
      practice: true,
      paused: false,
      stopAfterHand: false,
      phase: "lobby",
      members: [],
      buttonSeat: null,
      hand: null,
      handNumber: 0,
      turnEndsAt: null,
      botActAt: null,
      runoutAt: null,
      showdownUntil: null,
      betweenUntil: null,
      history: [],
      chat: [],
      banner: "Practice table. The bot squad stays for the next hand — deal when you want to play.",
      createdAt: this.now,
      updatedAt: this.now,
      lastHumanAt: this.now,
      version: 1,
      pendingEvents: [],
      championId: null,
      pendingBlinds: null,
    }
    this.rooms.set(room.code, room)
    for (const name of READY_GROUP.names) this.seatBot(room, name)
    this.touch(room)
  }

  private botSeated(room: Room, name: string) {
    return room.members.some((member) => member.isBot && member.name === name && member.seat !== null)
  }

  private seatBot(room: Room, name?: string) {
    const seat = this.firstOpenSeat(room)
    if (seat === null) throw new RoomError("No open seat for a bot.")
    const profile = name
      ? BOT_ROSTER.find((bot) => bot.name === name)
      : BOT_ROSTER.find((bot) => !this.botSeated(room, bot.name))
    if (!profile) throw new RoomError(name ? "That bot isn't in the squad." : "Every bot style is already seated.")
    if (this.botSeated(room, profile.name)) throw new RoomError(`${profile.name} is already at the table.`)
    const bot = this.makeMember(profile.name, { color: profile.color, emoji: profile.emoji }, true)
    bot.seat = seat
    bot.stack = room.startingStack
    bot.connected = true
    bot.botStyle = profile.style
    room.members.push(bot)
    return bot
  }

  private botBench(room: Room): BotBenchItem[] {
    return BOT_ROSTER.map((bot) => {
      const seated = room.members.find((member) => member.isBot && member.name === bot.name && member.seat !== null)
      return {
        name: bot.name,
        emoji: bot.emoji,
        style: bot.blurb,
        seated: Boolean(seated),
        playerId: seated?.id,
      }
    })
  }

  private note(room: Room, text: string) {
    room.banner = text
  }

  private stamp() {
    if (!this.manualClock) this.now = Date.now()
  }

  private touch(room: Room) {
    room.updatedAt = this.now
    room.version += 1
    room.lastHumanAt = room.members.some((member) => !member.isBot && member.connected) ? this.now : room.lastHumanAt
    this.dirty.add(room.code)
  }
}

function normalizeBlinds(smallBlind: number, bigBlind: number) {
  if (!Number.isInteger(smallBlind) || !Number.isInteger(bigBlind)) {
    throw new RoomError("Blinds must be whole chips.")
  }
  if (smallBlind < 1 || bigBlind <= smallBlind || bigBlind > 1_000_000) {
    throw new RoomError("Big blind must be larger than the small blind.")
  }
  return { smallBlind, bigBlind }
}

function normalizeStack(stack: number, bigBlind: number) {
  if (!Number.isInteger(stack) || stack < bigBlind * 10 || stack > 10_000_000) {
    throw new RoomError("Starting stack should be at least 10 big blinds.")
  }
  return stack
}

function normalizeClock(seconds: number) {
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 90) {
    throw new RoomError("Action clock must be between 10 and 90 seconds.")
  }
  return seconds
}

function normalizeAvatar(input?: Partial<Avatar>): Avatar {
  const color = AVATAR_COLORS.includes(input?.color ?? "") ? input!.color! : AVATAR_COLORS[randomInt(AVATAR_COLORS.length)]
  const emoji = AVATAR_EMOJIS.includes(input?.emoji ?? "") ? input!.emoji! : AVATAR_EMOJIS[randomInt(AVATAR_EMOJIS.length)]
  return { color, emoji }
}

function nextSeat(current: number, seats: number[]) {
  for (let step = 1; step <= MAX_SEATS; step++) {
    const seat = (current + step) % MAX_SEATS
    if (seats.includes(seat)) return seat
  }
  return seats[0]
}

function describeResult(result: HandResult) {
  if (result.payouts.length === 0) return "Hand complete."
  if (result.reason === "fold") {
    const winner = result.payouts[0]
    return `${winner.name} wins ${formatChips(winner.amount)}`
  }
  return result.payouts
    .map((payout) =>
      payout.handName
        ? `${payout.name} wins ${formatChips(payout.amount)} · ${payout.handName}`
        : `${payout.name} wins ${formatChips(payout.amount)}`,
    )
    .join("  ·  ")
}

export const rooms = new RoomManager()

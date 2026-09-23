import { describe, expect, it } from "vitest"

import { PRACTICE_CODE } from "@/lib/game/protocol"
import { RoomError, RoomManager } from "@/lib/game/rooms"

describe("room manager", () => {
  it("deals bots through a full hand and into the next one", () => {
    const manager = new RoomManager()
    manager.setClock(1_000_000)
    const created = manager.create({ name: "Ada", smallBlind: 50, bigBlind: 100, startingStack: 5000 })
    manager.hostAddBot(created.token)
    manager.hostAddBot(created.token)
    manager.setSittingOut(created.token, true)
    manager.hostStart(created.token)

    let time = 1_000_000
    let sawShowdown = false
    for (let step = 0; step < 500; step++) {
      time += 1000
      manager.tick(time)
      const snap = manager.snapshot(created.code, created.playerId)
      if (!snap) throw new Error("room vanished")
      if (snap.state.phase === "showdown" || snap.history.length > 0) sawShowdown = true
      if (snap.state.handNumber >= 2 && snap.history.length >= 1) break
    }

    const snap = manager.snapshot(created.code, created.playerId)!
    expect(sawShowdown).toBe(true)
    expect(snap.state.handNumber).toBeGreaterThanOrEqual(2)
    expect(snap.history.length).toBeGreaterThanOrEqual(1)
    expect(snap.history[0].board.length === 0 || snap.history[0].board.length === 5 || snap.history[0].reason === "fold").toBe(true)
    const seated = snap.state.players.filter((player) => player.isBot)
    const botChips = seated.reduce((sum, player) => sum + player.stack, 0) + snap.state.pot
    const hero = snap.state.players.find((player) => player.id === created.playerId)!
    expect(hero.stack).toBe(5000)
    expect(hero.sittingOut).toBe(true)
    expect(botChips).toBe(10_000)
    expect(snap.state.you?.isSpectator).toBe(false)
    expect(snap.state.players.some((player) => player.isBot)).toBe(true)
  })

  it("rejects a second player when the name is empty and blocks chat spam words", () => {
    const manager = new RoomManager()
    manager.setClock(50_000)
    const created = manager.create({ name: "Host" })
    expect(() => manager.join({ code: created.code, name: " " })).toThrow(RoomError)
    const friend = manager.join({ code: created.code, name: "Bea", spectate: true })
    expect(() => manager.chat(friend.token, "what a retard")).toThrow(/blocked/i)
    const snap = manager.snapshot(created.code, friend.playerId)!
    expect(snap.state.you?.isSpectator).toBe(true)
    expect(snap.state.spectators).toHaveLength(1)
  })

  it("opens a standing practice table with the ready group and rebuilds it", () => {
    const manager = new RoomManager()
    manager.setClock(10_000)
    const seated = manager.joinPractice({ name: "Ada" })
    expect(seated.code).toBe(PRACTICE_CODE)
    const snap = manager.snapshot(seated.code, seated.playerId)!
    expect(snap.state.practice).toBe(true)
    expect(snap.state.you?.isHost).toBe(true)
    expect(snap.state.players.filter((player) => player.isBot).map((player) => player.name).sort()).toEqual([
      "Bluff Bot",
      "Check Bot",
      "River Bot",
    ])
    expect(manager.listRooms().some((room) => room.practice && room.title === "Practice · bots ready")).toBe(true)

    manager.leave(seated.token)
    const still = manager.snapshot(PRACTICE_CODE)
    expect(still?.state.players.filter((player) => player.isBot)).toHaveLength(3)

    const restarted = new RoomManager()
    restarted.setClock(20_000)
    const again = restarted.joinPractice({ name: "Bea" })
    expect(again.code).toBe(PRACTICE_CODE)
    expect(restarted.snapshot(again.code, again.playerId)!.state.players.filter((player) => player.isBot)).toHaveLength(3)
  })

  it("seats a ready group in one action and removes bots one tap at a time", () => {
    const manager = new RoomManager()
    manager.setClock(30_000)
    const created = manager.create({ name: "Host" })
    manager.hostAddReadyGroup(created.token)
    const names = manager
      .snapshot(created.code, created.playerId)!
      .state.players.filter((player) => player.isBot)
      .map((player) => player.name)
    expect(names.sort()).toEqual(["Bluff Bot", "Check Bot", "River Bot"])
    expect(() => manager.hostAddReadyGroup(created.token)).toThrow(/already seated/i)

    manager.hostAddBot(created.token, "Pocket Pete")
    manager.hostClearBots(created.token)
    expect(manager.snapshot(created.code, created.playerId)!.state.players.some((player) => player.isBot)).toBe(false)

    manager.hostAddBot(created.token, "River Bot")
    const snap = manager.snapshot(created.code, created.playerId)!
    expect(snap.state.players.filter((player) => player.isBot).map((player) => player.name)).toEqual(["River Bot"])
    const river = snap.state.botBench.find((bot) => bot.name === "River Bot")
    expect(river?.seated).toBe(true)
    manager.hostRemoveBot(created.token, river!.playerId!)
    expect(manager.snapshot(created.code, created.playerId)!.state.botBench.find((bot) => bot.name === "River Bot")?.seated).toBe(false)
  })

  it("sits a busted player out and does not deal them the next hand", () => {
    const manager = new RoomManager()
    let time = 200_000
    manager.setClock(time)
    const created = manager.create({
      name: "Ada",
      smallBlind: 50,
      bigBlind: 100,
      startingStack: 1000,
      actionTimeSec: 25,
    })
    const friend = manager.join({ code: created.code, name: "Bea" })
    manager.hostStart(created.token)

    let bustedId: string | null = null
    for (let hand = 0; hand < 24 && !bustedId; hand++) {
      for (let step = 0; step < 6 && manager.snapshot(created.code, created.playerId)!.state.phase !== "hand"; step++) {
        time += 1000
        manager.tick(time)
      }
      const opening = manager.snapshot(created.code, created.playerId)!
      expect(opening.state.phase).toBe("hand")
      for (let guard = 0; guard < 4; guard++) {
        const live = manager.snapshot(created.code, created.playerId)!
        if (live.state.phase !== "hand") break
        const actorId = live.state.players.find((player) => player.isTurn)?.id
        if (!actorId) break
        const token = actorId === friend.playerId ? friend.token : created.token
        const viewer = actorId === friend.playerId ? friend.playerId : created.playerId
        const legal = manager.snapshot(created.code, viewer)!.state.you?.legal
        if (!legal) break
        if (legal.canWager) manager.act(token, { type: "wager", amount: legal.maxWager })
        else if (legal.call) manager.act(token, { type: "call" })
        else if (legal.check) manager.act(token, { type: "check" })
        else break
      }
      for (let step = 0; step < 16; step++) {
        time += 1000
        manager.tick(time)
        const snap = manager.snapshot(created.code, created.playerId)!
        const busted = snap.state.players.find((player) => player.stack === 0 && player.sittingOut)
        if (busted && snap.state.phase === "between") {
          bustedId = busted.id
          expect(busted.hasCards).toBe(false)
          break
        }
        if (snap.state.phase === "hand" && snap.state.handNumber > opening.state.handNumber) break
      }
    }

    expect(bustedId).toBeTruthy()
    const handNumber = manager.snapshot(created.code, created.playerId)!.state.handNumber
    for (let step = 0; step < 8; step++) {
      time += 1000
      manager.tick(time)
    }
    const after = manager.snapshot(created.code, created.playerId)!
    const busted = after.state.players.find((player) => player.id === bustedId)
    expect(busted?.stack).toBe(0)
    expect(busted?.sittingOut).toBe(true)
    expect(busted?.hasCards).toBe(false)
    expect(after.state.handNumber).toBe(handNumber)
    expect(after.state.phase).toBe("between")
    expect(after.state.players.filter((player) => player.hasCards)).toHaveLength(0)
  })

  it("keeps you in the hand when another tab opens the same seat", () => {
    const manager = new RoomManager()
    manager.setClock(40_000)
    const created = manager.create({ name: "Ada" })
    const first = manager.resume(created.token, { socketId: "tab-a" })
    expect(first.conflict).toBe(false)
    const second = manager.resume(created.token, { socketId: "tab-b" })
    expect(second.conflict).toBe(true)
    expect(manager.snapshot(created.code, created.playerId)!.state.you?.sittingOut).toBe(false)

    const taken = manager.resume(created.token, { socketId: "tab-b", takeover: true })
    expect(taken.conflict).toBe(false)
    expect(taken.displacedSocketId).toBe("tab-a")
    expect(manager.snapshot(created.code, created.playerId)!.state.you?.sittingOut).toBe(false)

    manager.disconnect(created.token, "tab-a")
    const afterOldTab = manager.snapshot(created.code, created.playerId)!
    expect(afterOldTab.state.you?.sittingOut).toBe(false)
    expect(afterOldTab.state.players.find((player) => player.id === created.playerId)?.connected).toBe(true)
  })
})

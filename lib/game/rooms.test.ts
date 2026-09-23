import { describe, expect, it } from "vitest"

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
})

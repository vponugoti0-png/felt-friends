import { describe, expect, it } from "vitest"

import { cardKey, makeDeck, parseCard, parseCards, shuffleDeck, type Card } from "@/lib/poker/cards"
import { chooseBotAction } from "@/lib/poker/bots"
import { PokerHand, type PlayerAction, type SeatInput } from "@/lib/poker/hand"

describe("no-limit hold'em hand", () => {
  it("posts blinds, rotates the first actor, and lets the big blind check", () => {
    const hand = new PokerHand({
      seats: seats(3),
      buttonSeat: 2,
      smallBlind: 50,
      bigBlind: 100,
      deck: paddedDeck(["As", "Kd", "Qc", "2h", "3d", "4c"]),
    })
    hand.start()
    const sb = hand.players.find((player) => player.id === "p0")!
    const bb = hand.players.find((player) => player.id === "p1")!
    const button = hand.players.find((player) => player.id === "p2")!
    expect(hand.sbPlayerId).toBe(sb.id)
    expect(hand.bbPlayerId).toBe(bb.id)
    expect(sb.streetBet).toBe(50)
    expect(bb.streetBet).toBe(100)
    expect(hand.toActId).toBe(button.id)
    expect(button.hole).toEqual([parseCard("Qc"), parseCard("4c")])
    expect(sb.hole).toEqual([parseCard("As"), parseCard("2h")])

    hand.act(button.id, { type: "call" })
    hand.act(sb.id, { type: "call" })
    const bbLegal = hand.legalActions(bb.id)
    expect(bbLegal.check).toBe(true)
    expect(bbLegal.canWager).toBe(true)
    hand.act(bb.id, { type: "check" })
    expect(hand.phase).toBe("between-streets")
    expect(hand.chipsInPlay()).toBe(hand.startingTotal)
  })

  it("uses the button as the small blind heads-up and acts first preflop", () => {
    const hand = new PokerHand({
      seats: seats(2),
      buttonSeat: 0,
      smallBlind: 50,
      bigBlind: 100,
      deck: paddedDeck(["Ah", "Kd", "2c", "3d"]),
    })
    hand.start()
    expect(hand.sbPlayerId).toBe("p0")
    expect(hand.bbPlayerId).toBe("p1")
    expect(hand.toActId).toBe("p0")
    hand.act("p0", { type: "call" })
    hand.act("p1", { type: "check" })
    expect(hand.street).toBe("preflop")
    hand.dealNext()
    expect(hand.street).toBe("flop")
    expect(hand.toActId).toBe("p1")
  })

  it("enforces the minimum raise and does not reopen action on a short all-in", () => {
    const hand = new PokerHand({
      seats: [
        { id: "utg", seat: 0, name: "UTG", stack: 10000 },
        { id: "sb", seat: 1, name: "SB", stack: 10000 },
        { id: "bb", seat: 2, name: "BB", stack: 350 },
      ],
      buttonSeat: 0,
      smallBlind: 50,
      bigBlind: 100,
      deck: paddedDeck(["As", "Kd", "Qc", "2h", "3d", "4c"]),
    })
    hand.start()
    expect(hand.toActId).toBe("utg")
    expect(() => hand.act("utg", { type: "wager", amount: 150 })).toThrow(/Minimum raise/)
    hand.act("utg", { type: "wager", amount: 300 })
    hand.act("sb", { type: "call" })
    expect(hand.toActId).toBe("bb")
    const bbLegal = hand.legalActions("bb")
    expect(bbLegal.maxWager).toBe(350)
    expect(bbLegal.minWager).toBeGreaterThan(350)
    hand.act("bb", { type: "wager", amount: 350 })
    expect(hand.toActId).toBe("utg")
    const reopen = hand.legalActions("utg")
    expect(reopen.call).toBe(true)
    expect(reopen.canWager).toBe(false)
    expect(() => hand.act("utg", { type: "wager", amount: 1000 })).toThrow(/cannot bet or raise/)
    hand.act("utg", { type: "call" })
    hand.act("sb", { type: "call" })
    expect(hand.phase).toBe("between-streets")
  })

  it("awards a fold to the last remaining player and returns the uncalled blind", () => {
    const hand = startedThree()
    hand.act("p2", { type: "fold" })
    hand.act("p0", { type: "fold" })
    expect(hand.phase).toBe("complete")
    expect(hand.result?.reason).toBe("fold")
    expect(hand.result?.revealed).toEqual([])
    expect(stack("p1", hand)).toBe(10050)
    expect(stack("p0", hand)).toBe(9950)
    expect(stack("p2", hand)).toBe(10000)
    expect(hand.players.reduce((sum, player) => sum + player.stack, 0)).toBe(hand.startingTotal)
  })

  it("creates side pots on a multi-way all-in and pays the right winners", () => {
    const deck = scriptedDeck(
      [
        ["Ah", "Ad"],
        ["Kh", "Kd"],
        ["2c", "7d"],
      ],
      ["9c", "8d", "3s", "4h", "6c"],
    )
    const hand = new PokerHand({
      seats: [
        { id: "A", seat: 0, name: "A", stack: 100 },
        { id: "B", seat: 1, name: "B", stack: 300 },
        { id: "C", seat: 2, name: "C", stack: 1000 },
      ],
      buttonSeat: 2,
      smallBlind: 50,
      bigBlind: 100,
      deck,
    })
    hand.start()
    hand.act("C", { type: "wager", amount: 1000 })
    hand.act("A", { type: "call" })
    hand.act("B", { type: "call" })
    while (hand.phase !== "complete") {
      expect(hand.phase).toBe("between-streets")
      hand.dealNext()
    }
    expect(hand.result?.reason).toBe("showdown")
    expect(hand.board).toHaveLength(5)
    expect(stack("A", hand)).toBe(300)
    expect(stack("B", hand)).toBe(400)
    expect(stack("C", hand)).toBe(700)
    expect(hand.players.reduce((sum, player) => sum + player.stack, 0)).toBe(1400)
    const aceWin = hand.result?.payouts.find((payout) => payout.playerId === "A")
    expect(aceWin?.handName).toBe("Pair of Aces")
  })

  it("splits a chopped board and conserves chips", () => {
    const deck = scriptedDeck(
      [
        ["2c", "7d"],
        ["3c", "8d"],
        ["4c", "9d"],
      ],
      ["Ah", "Kh", "Qh", "Jh", "Th"],
    )
    const hand = new PokerHand({
      seats: seats(3, 1000),
      buttonSeat: 0,
      smallBlind: 50,
      bigBlind: 100,
      deck,
    })
    playCheckdown(hand)
    expect(hand.result?.reason).toBe("showdown")
    expect(hand.result?.revealed.every((handRank) => handRank.handName === "Royal Flush")).toBe(true)
    const end = hand.players.reduce((sum, player) => sum + player.stack, 0)
    expect(end).toBe(hand.startingTotal)
    const deltas = hand.players.map((player) => player.stack - player.startingStack)
    expect(deltas.reduce((sum, delta) => sum + delta, 0)).toBe(0)
  })

  it("conserves chips across random hands, including bot decisions", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = mulberry32(seed)
      const count = 2 + Math.floor(rng() * 8)
      const table = Array.from({ length: count }, (_, index) => ({
        id: `p${index}`,
        seat: index,
        name: `P${index}`,
        stack: 400 + Math.floor(rng() * 4000),
      }))
      const hand = new PokerHand({
        seats: table,
        buttonSeat: Math.floor(rng() * count),
        smallBlind: 50,
        bigBlind: 100,
        deck: shuffleDeck(rng),
      })
      hand.start()
      let guard = 0
      while (hand.phase !== "complete") {
        if (guard++ > 400) throw new Error("hand did not finish")
        if (hand.phase === "between-streets") {
          expect(hand.chipsInPlay()).toBe(hand.startingTotal)
          hand.dealNext()
          continue
        }
        const id = hand.toActId
        if (!id) throw new Error("missing actor")
        const legal = hand.legalActions(id)
        const player = hand.players.find((candidate) => candidate.id === id)!
        let action: PlayerAction
        if (player.hole && rng() < 0.55) {
          action = chooseBotAction(
            {
              hole: player.hole,
              board: hand.board,
              street: hand.street,
              pot: hand.potTotal,
              legal,
              bigBlind: hand.bigBlind,
            },
            { tightness: rng(), aggression: rng() },
            rng,
          )
        } else {
          action = randomLegal(legal, rng)
        }
        hand.act(id, action)
        const phase: string = hand.phase
        if (phase !== "complete") expect(hand.chipsInPlay()).toBe(hand.startingTotal)
      }
      expect(hand.players.reduce((sum, player) => sum + player.stack, 0)).toBe(hand.startingTotal)
    }
  })
})

function seats(count: number, stack = 10000): SeatInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    seat: index,
    name: `P${index}`,
    stack,
  }))
}

function startedThree() {
  const hand = new PokerHand({
    seats: seats(3),
    buttonSeat: 2,
    smallBlind: 50,
    bigBlind: 100,
    deck: paddedDeck(["As", "Kd", "Qc", "2h", "3d", "4c", "5s", "6d", "7h", "8c", "9s"]),
  })
  hand.start()
  return hand
}

function stack(id: string, hand: PokerHand) {
  return hand.players.find((player) => player.id === id)!.stack
}

function playCheckdown(hand: PokerHand) {
  hand.start()
  let guard = 0
  while (hand.phase !== "complete") {
    if (guard++ > 80) throw new Error("checkdown stalled")
    if (hand.phase === "between-streets") {
      hand.dealNext()
      continue
    }
    const id = hand.toActId!
    const legal = hand.legalActions(id)
    if (legal.check) hand.act(id, { type: "check" })
    else if (legal.call) hand.act(id, { type: "call" })
    else hand.act(id, { type: "fold" })
  }
}

function paddedDeck(lead: string[]): Card[] {
  const leadCards = parseCards(lead.join(" "))
  const used = new Set(leadCards.map(cardKey))
  const rest = makeDeck().filter((card) => !used.has(cardKey(card)))
  return [...leadCards, ...rest]
}

function scriptedDeck(holesInDealOrder: string[][], board: string[]): Card[] {
  const deal: string[] = []
  for (let round = 0; round < 2; round++) {
    for (const hole of holesInDealOrder) deal.push(hole[round])
  }
  deal.push("Qs")
  deal.push(...board.slice(0, 3))
  deal.push("Qd")
  deal.push(board[3])
  deal.push("Qc")
  deal.push(board[4])
  return paddedDeck(deal)
}

function randomLegal(legal: PokerHand extends never ? never : ReturnType<PokerHand["legalActions"]>, rng: () => number): PlayerAction {
  const roll = rng()
  if (legal.canWager && roll < 0.35) {
    if (legal.maxWager <= legal.minWager || roll < 0.1) return { type: "wager", amount: legal.maxWager }
    const span = legal.maxWager - legal.minWager
    const amount = legal.minWager + Math.floor(rng() * (span + 1))
    return { type: "wager", amount }
  }
  if (legal.check && roll < 0.7) return { type: "check" }
  if (legal.call && roll < 0.85) return { type: "call" }
  if (legal.fold) return { type: "fold" }
  if (legal.check) return { type: "check" }
  if (legal.call) return { type: "call" }
  return { type: "wager", amount: legal.maxWager }
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

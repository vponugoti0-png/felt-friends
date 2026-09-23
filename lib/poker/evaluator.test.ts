import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

import { cardKey, parseCards, shuffleDeck, type Card } from "@/lib/poker/cards"
import { compareScores, evaluate, straightHighCard } from "@/lib/poker/evaluator"

const require = createRequire(import.meta.url)
const { Hand } = require("pokersolver") as {
  Hand: {
    solve: (cards: string[]) => { descr: string }
    winners: (hands: { descr: string }[]) => { descr: string }[]
  }
}

function expectName(cards: string, name: string) {
  expect(evaluate(parseCards(cards)).name).toBe(name)
}

function solverCards(cards: Card[]): string[] {
  return cards.map(cardKey)
}

describe("hand evaluator", () => {
  it("names every category from high card through royal flush", () => {
    expectName("2c 5d 7h 9s Jc", "Jack high")
    expectName("Ah Ad 7c 5s 2d", "Pair of Aces")
    expectName("Ah Ad Kh Kd 2c", "Two Pair, Aces and Kings")
    expectName("Qh Qd Qc 7s 2c", "Three of a Kind, Queens")
    expectName("9c 8d 7h 6s 5c", "Straight, Nine high")
    expectName("Ah 2c 3d 4s 5h", "Straight, Five high")
    expectName("Ah Kh 7h 4h 2h", "Flush, Ace high")
    expectName("Kh Kd Kc 9s 9d", "Full House, Kings full of Nines")
    expectName("8c 8d 8h 8s 3c", "Four of a Kind, Eights")
    expectName("Kh Qh Jh Th 9h", "Straight Flush, King high")
    expectName("Ah 5h 4h 3h 2h", "Straight Flush, Five high")
    expectName("Ah Kh Qh Jh Th", "Royal Flush")
  })

  it("ranks the wheel below a six-high straight and keeps kickers off straights", () => {
    const wheel = evaluate(parseCards("Ah 2c 3d 4s 5h"))
    const six = evaluate(parseCards("6c 5d 4h 3s 2c"))
    expect(straightHighCard([14, 5, 4, 3, 2])).toBe(5)
    expect(compareScores(six.score, wheel.score)).toBeGreaterThan(0)
    expect(wheel.score).toEqual([4, 5])
  })

  it("uses kickers for pairs, two pair, trips, quads, and flushes", () => {
    const aceKing = evaluate(parseCards("Ah Ad Kh Qd 2c"))
    const aceQueen = evaluate(parseCards("As Ac Qh Jd 2d"))
    expect(compareScores(aceKing.score, aceQueen.score)).toBeGreaterThan(0)

    const twoPairKing = evaluate(parseCards("Ah Ad Kh Kd Qc"))
    const twoPairJack = evaluate(parseCards("As Ac Ks Kd Jc"))
    expect(compareScores(twoPairKing.score, twoPairJack.score)).toBeGreaterThan(0)

    const tripsKing = evaluate(parseCards("7h 7d 7c Kh 2s"))
    const tripsQueen = evaluate(parseCards("7s 7c 7d Qh 2c"))
    expect(compareScores(tripsKing.score, tripsQueen.score)).toBeGreaterThan(0)

    const quadsKing = evaluate(parseCards("9h 9d 9c 9s Kh"))
    const quadsQueen = evaluate(parseCards("9h 9d 9c 9s Qh"))
    expect(compareScores(quadsKing.score, quadsQueen.score)).toBeGreaterThan(0)

    const flushKing = evaluate(parseCards("Ah Kh 8h 4h 2h"))
    const flushQueen = evaluate(parseCards("As Qs 8s 4s 2s"))
    expect(compareScores(flushKing.score, flushQueen.score)).toBeGreaterThan(0)
  })

  it("ranks full houses by trips first, then the pair", () => {
    const acesFull = evaluate(parseCards("Ah Ad As Kh Kd"))
    const kingsFull = evaluate(parseCards("Kh Kd Kc Ah Ad"))
    const acesQueens = evaluate(parseCards("Ah Ad As Qh Qd"))
    expect(compareScores(acesFull.score, kingsFull.score)).toBeGreaterThan(0)
    expect(compareScores(acesFull.score, acesQueens.score)).toBeGreaterThan(0)
    expect(acesFull.name).toBe("Full House, Aces full of Kings")
  })

  it("picks the best five from seven cards, including playing the board", () => {
    const royalBoard = evaluate(parseCards("2c 7d Ah Kh Qh Jh Th 3c"))
    expect(royalBoard.name).toBe("Royal Flush")
    expect(royalBoard.bestFive.map(cardKey).sort()).toEqual(["Ah", "Jh", "Kh", "Qh", "Th"].sort())

    const boardOnly = evaluate(parseCards("2c 3d Ah Kh Qh Jh Th"))
    const otherJunk = evaluate(parseCards("4c 5d Ah Kh Qh Jh Th"))
    expect(compareScores(boardOnly.score, otherJunk.score)).toBe(0)
  })

  it("ties identical kickers and splits category order correctly", () => {
    const left = evaluate(parseCards("Ah Kd Qc Js 9c"))
    const right = evaluate(parseCards("Ad Kh Qd Jc 9d"))
    expect(compareScores(left.score, right.score)).toBe(0)

    const categories = [
      "2c 5d 7h 9s Jc",
      "Ah Ad 7c 5s 2d",
      "Ah Ad Kh Kd 2c",
      "Qh Qd Qc 7s 2c",
      "9c 8d 7h 6s 5c",
      "Ah Kh 7h 4h 2h",
      "Kh Kd Kc 9s 9d",
      "8c 8d 8h 8s 3c",
      "Kh Qh Jh Th 9h",
      "Ah Kh Qh Jh Th",
    ].map((text) => evaluate(parseCards(text)))

    for (let i = 1; i < categories.length; i++) {
      expect(compareScores(categories[i].score, categories[i - 1].score)).toBeGreaterThan(0)
    }
  })

  it("matches pokersolver on random seven-card showdowns", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed)
      const deck = shuffleDeck(rng)
      const a = deck.slice(0, 7)
      const b = deck.slice(7, 14)
      const oursA = evaluate(a)
      const oursB = evaluate(b)
      const solverA = Hand.solve(solverCards(a))
      const solverB = Hand.solve(solverCards(b))
      const winners = Hand.winners([solverA, solverB])
      const cmp = compareScores(oursA.score, oursB.score)
      if (winners.length === 2) {
        expect(cmp).toBe(0)
      } else if (winners[0] === solverA) {
        expect(cmp).toBeGreaterThan(0)
      } else {
        expect(cmp).toBeLessThan(0)
      }
    }
  })
})

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

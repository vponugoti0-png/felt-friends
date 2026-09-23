import { describe, expect, it } from "vitest"

import { oddChipKey, settlePots } from "@/lib/poker/pots"

describe("side pots", () => {
  it("returns an uncalled wager and splits main and side pots", () => {
    const players = [
      { id: "A", committed: 100, folded: false, seat: 0 },
      { id: "B", committed: 300, folded: false, seat: 1 },
      { id: "C", committed: 500, folded: false, seat: 2 },
    ]
    const ranks: Record<string, number[]> = {
      A: [1, 14],
      B: [1, 13],
      C: [1, 12],
    }
    const result = settlePots(players, 2, 9, (id) => ranks[id])
    expect(result.returned).toEqual([{ playerId: "C", amount: 200 }])
    expect(result.pots.map((pot) => pot.amount)).toEqual([300, 400])
    expect(result.pots[0].winnerIds).toEqual(["A"])
    expect(result.pots[1].winnerIds).toEqual(["B"])
    expect(award(result.awards, "A")).toBe(300)
    expect(award(result.awards, "B")).toBe(400)
    expect(result.awards.find((item) => item.playerId === "C")).toBeUndefined()
    expect(chipTotal(result)).toBe(900)
  })

  it("keeps folded chips in the pot but not as claimants", () => {
    const players = [
      { id: "A", committed: 200, folded: true, seat: 0 },
      { id: "B", committed: 200, folded: false, seat: 3 },
      { id: "C", committed: 200, folded: false, seat: 5 },
    ]
    const result = settlePots(players, 0, 9, (id) => (id === "C" ? [8, 14] : [1, 10]))
    expect(result.returned).toEqual([])
    expect(result.pots).toHaveLength(1)
    expect(result.pots[0].amount).toBe(600)
    expect(result.pots[0].winnerIds).toEqual(["C"])
  })

  it("splits a tie and gives the odd chip to the seat left of the button", () => {
    const players = [
      { id: "near", committed: 50, folded: false, seat: 1 },
      { id: "far", committed: 51, folded: false, seat: 4 },
    ]
    const result = settlePots(players, 0, 9, () => [4, 10])
    expect(result.returned).toEqual([{ playerId: "far", amount: 1 }])
    expect(result.pots[0].amount).toBe(100)
    expect(result.pots[0].shares.near).toBe(50)
    expect(result.pots[0].shares.far).toBe(50)

    const odd = settlePots(
      [
        { id: "left", committed: 51, folded: false, seat: 1 },
        { id: "button", committed: 50, folded: false, seat: 0 },
      ],
      0,
      9,
      () => [0, 14, 13, 12, 11, 9],
    )
    expect(odd.pots[0].amount).toBe(100)
    expect(odd.returned).toEqual([{ playerId: "left", amount: 1 }])

    const splitOdd = settlePots(
      [
        { id: "btn", committed: 1, folded: false, seat: 0 },
        { id: "sb", committed: 1, folded: false, seat: 1 },
        { id: "bb", committed: 1, folded: true, seat: 2 },
      ],
      0,
      9,
      () => [1, 9],
    )
    expect(splitOdd.returned).toEqual([])
    expect(splitOdd.pots[0].amount).toBe(3)
    expect(splitOdd.pots[0].shares.sb).toBe(2)
    expect(splitOdd.pots[0].shares.btn).toBe(1)
    expect(oddChipKey(1, 0, 9)).toBeLessThan(oddChipKey(0, 0, 9))
  })
})

function award(awards: { playerId: string; amount: number }[], id: string) {
  return awards.find((item) => item.playerId === id)?.amount ?? 0
}

function chipTotal(result: { returned: { amount: number }[]; awards: { amount: number }[] }) {
  return (
    result.returned.reduce((sum, item) => sum + item.amount, 0) +
    result.awards.reduce((sum, item) => sum + item.amount, 0)
  )
}

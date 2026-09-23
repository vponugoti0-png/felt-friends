import { compareScores } from "@/lib/poker/evaluator"

export interface PotPlayer {
  id: string
  committed: number
  folded: boolean
  seat: number
}

export interface ChipMove {
  playerId: string
  amount: number
}

export interface PotResult {
  amount: number
  winnerIds: string[]
  shares: Record<string, number>
  handName?: string
}

export interface Settlement {
  returned: ChipMove[]
  awards: ChipMove[]
  pots: PotResult[]
}

/**
 * Build side pots from committed chips.
 * Uncalled chips (a player who put in more than anyone else) are returned
 * and are not part of a pot. Odd chips go to the winner closest to the left
 * of the button.
 */
export function settlePots(
  players: PotPlayer[],
  buttonSeat: number,
  maxSeats: number,
  rankOf: (playerId: string) => number[] | null,
  handNameOf?: (playerId: string) => string | undefined,
): Settlement {
  const committed = new Map(players.map((player) => [player.id, player.committed]))
  const returned: ChipMove[] = []

  const positive = players.filter((player) => (committed.get(player.id) ?? 0) > 0)
  const amountsDesc = positive.map((player) => committed.get(player.id) ?? 0).sort((a, b) => b - a)
  if (amountsDesc.length > 0 && amountsDesc[0] > (amountsDesc[1] ?? 0)) {
    const top = amountsDesc[0]
    const tops = positive.filter((player) => committed.get(player.id) === top)
    if (tops.length === 1) {
      const uncalled = top - (amountsDesc[1] ?? 0)
      committed.set(tops[0].id, top - uncalled)
      returned.push({ playerId: tops[0].id, amount: uncalled })
    }
  }

  const levels = [...new Set([...committed.values()].filter((value) => value > 0))].sort((a, b) => a - b)
  const awards = new Map<string, number>()
  const pots: PotResult[] = []
  let previous = 0

  for (const level of levels) {
    const layer = level - previous
    const involved = players.filter((player) => (committed.get(player.id) ?? 0) >= level)
    const amount = layer * involved.length
    previous = level
    if (amount <= 0) continue

    const claimants = involved.filter((player) => !player.folded)
    if (claimants.length === 0) {
      throw new Error("Pot layer has chips but no eligible player")
    }

    let winnerIds: string[]
    if (claimants.length === 1) {
      winnerIds = [claimants[0].id]
    } else {
      const scored = claimants.map((player) => {
        const score = rankOf(player.id)
        if (!score) throw new Error(`Missing hand rank for ${player.id}`)
        return { id: player.id, score }
      })
      scored.sort((a, b) => compareScores(b.score, a.score))
      const best = scored[0].score
      winnerIds = scored.filter((entry) => compareScores(entry.score, best) === 0).map((entry) => entry.id)
    }

    const ordered = orderForOddChips(winnerIds, players, buttonSeat, maxSeats)
    const share = Math.floor(amount / ordered.length)
    let remainder = amount % ordered.length
    const shares: Record<string, number> = {}
    for (const id of ordered) {
      const extra = remainder > 0 ? 1 : 0
      if (remainder > 0) remainder -= 1
      const got = share + extra
      shares[id] = got
      awards.set(id, (awards.get(id) ?? 0) + got)
    }

    const name =
      ordered.length === 1
        ? handNameOf?.(ordered[0])
        : handNameOf?.(ordered[0])

    pots.push({
      amount,
      winnerIds: ordered,
      shares,
      handName: name,
    })
  }

  return {
    returned,
    awards: [...awards.entries()].map(([playerId, amount]) => ({ playerId, amount })),
    pots,
  }
}

export function oddChipKey(seat: number, buttonSeat: number, maxSeats: number): number {
  return (seat - buttonSeat - 1 + maxSeats * 4) % maxSeats
}

function orderForOddChips(
  winnerIds: string[],
  players: PotPlayer[],
  buttonSeat: number,
  maxSeats: number,
): string[] {
  return [...winnerIds].sort((a, b) => {
    const seatA = players.find((player) => player.id === a)?.seat ?? 0
    const seatB = players.find((player) => player.id === b)?.seat ?? 0
    return oddChipKey(seatA, buttonSeat, maxSeats) - oddChipKey(seatB, buttonSeat, maxSeats)
  })
}

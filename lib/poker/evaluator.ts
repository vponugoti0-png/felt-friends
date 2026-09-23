import {
  RANK_NAME,
  RANK_PLURAL,
  type Card,
  type Rank,
} from "@/lib/poker/cards"

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "trips"
  | "straight"
  | "flush"
  | "full-house"
  | "quads"
  | "straight-flush"
  | "royal-flush"

export interface HandValue {
  /** Lexicographic score. Higher is better. */
  score: number[]
  category: HandCategory
  name: string
  bestFive: Card[]
}

const CATEGORY_SCORE: Record<HandCategory, number> = {
  "high-card": 0,
  pair: 1,
  "two-pair": 2,
  trips: 3,
  straight: 4,
  flush: 5,
  "full-house": 6,
  quads: 7,
  "straight-flush": 8,
  "royal-flush": 8,
}

export function compareScores(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function evaluate(cards: Card[]): HandValue {
  if (cards.length < 5) {
    throw new Error("Need at least 5 cards to evaluate a hand")
  }
  let best: HandValue | null = null
  for (const combo of combinations(cards, 5)) {
    const scored = scoreFive(combo)
    if (!best || compareScores(scored.score, best.score) > 0) {
      best = { ...scored, bestFive: combo }
    }
  }
  if (!best) throw new Error("Unable to evaluate hand")
  return best
}

function scoreFive(cards: Card[]): Omit<HandValue, "bestFive"> {
  const ranksDesc = cards.map((card) => card.rank).sort((a, b) => b - a)
  const flush = cards.every((card) => card.suit === cards[0].suit)
  const straightHigh = straightHighCard(ranksDesc)
  const groups = rankGroups(ranksDesc)

  if (flush && straightHigh) {
    if (straightHigh === 14) {
      return named("royal-flush", [CATEGORY_SCORE["straight-flush"], 14], "Royal Flush")
    }
    return named(
      "straight-flush",
      [CATEGORY_SCORE["straight-flush"], straightHigh],
      `Straight Flush, ${RANK_NAME[straightHigh]} high`,
    )
  }

  if (groups[0][1] === 4) {
    const quad = groups[0][0]
    const kicker = groups[1][0]
    return named(
      "quads",
      [CATEGORY_SCORE.quads, quad, kicker],
      `Four of a Kind, ${RANK_PLURAL[quad]}`,
    )
  }

  if (groups[0][1] === 3 && groups[1]?.[1] === 2) {
    const trip = groups[0][0]
    const pair = groups[1][0]
    return named(
      "full-house",
      [CATEGORY_SCORE["full-house"], trip, pair],
      `Full House, ${RANK_PLURAL[trip]} full of ${RANK_PLURAL[pair]}`,
    )
  }

  if (flush) {
    return named("flush", [CATEGORY_SCORE.flush, ...ranksDesc], `Flush, ${RANK_NAME[ranksDesc[0]]} high`)
  }

  if (straightHigh) {
    return named(
      "straight",
      [CATEGORY_SCORE.straight, straightHigh],
      `Straight, ${RANK_NAME[straightHigh]} high`,
    )
  }

  if (groups[0][1] === 3) {
    const trip = groups[0][0]
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0])
    return named(
      "trips",
      [CATEGORY_SCORE.trips, trip, ...kickers],
      `Three of a Kind, ${RANK_PLURAL[trip]}`,
    )
  }

  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const high = groups[0][0]
    const low = groups[1][0]
    const kicker = groups[2][0]
    return named(
      "two-pair",
      [CATEGORY_SCORE["two-pair"], high, low, kicker],
      `Two Pair, ${RANK_PLURAL[high]} and ${RANK_PLURAL[low]}`,
    )
  }

  if (groups[0][1] === 2) {
    const pair = groups[0][0]
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0])
    return named("pair", [CATEGORY_SCORE.pair, pair, ...kickers], `Pair of ${RANK_PLURAL[pair]}`)
  }

  return named(
    "high-card",
    [CATEGORY_SCORE["high-card"], ...ranksDesc],
    `${RANK_NAME[ranksDesc[0]]} high`,
  )
}

function named(category: HandCategory, score: number[], name: string): Omit<HandValue, "bestFive"> {
  return { category, score, name }
}

function rankGroups(ranksDesc: number[]): [Rank, number][] {
  const counts = new Map<number, number>()
  for (const rank of ranksDesc) counts.set(rank, (counts.get(rank) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]) as [Rank, number][]
}

/** Highest card of a 5-card straight, or null. Wheel (A-5) returns 5. */
export function straightHighCard(ranksDesc: number[]): number | null {
  const unique = [...new Set(ranksDesc)].sort((a, b) => b - a)
  if (unique.length !== 5) return null
  let consecutive = true
  for (let i = 1; i < unique.length; i++) {
    if (unique[i - 1] - unique[i] !== 1) {
      consecutive = false
      break
    }
  }
  if (consecutive) return unique[0]
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
    return 5
  }
  return null
}

function combinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  const pick: T[] = []
  const walk = (start: number) => {
    if (pick.length === size) {
      out.push(pick.slice())
      return
    }
    for (let i = start; i < items.length; i++) {
      pick.push(items[i])
      walk(i + 1)
      pick.pop()
    }
  }
  walk(0)
  return out
}

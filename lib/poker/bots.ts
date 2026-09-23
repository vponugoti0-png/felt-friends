import { type Card } from "@/lib/poker/cards"
import { evaluate } from "@/lib/poker/evaluator"
import { type LegalActions, type PlayerAction, type Street } from "@/lib/poker/hand"

export interface BotStyle {
  tightness: number
  aggression: number
}

export interface BotView {
  hole: [Card, Card]
  board: Card[]
  street: Street
  pot: number
  legal: LegalActions
  bigBlind: number
}

export function chooseBotAction(view: BotView, style: BotStyle, rng: () => number = Math.random): PlayerAction {
  const { legal } = view
  if (!legal.fold && !legal.check && !legal.call && !legal.canWager) {
    if (legal.check) return { type: "check" }
    throw new Error("Bot has no legal action")
  }

  const strength = view.street === "preflop" ? preflopScore(view.hole) : postflopCategory(view)
  const draw = view.street !== "preflop" && view.street !== "river" && hasDraw(view.hole, view.board)
  const pressure = legal.callAmount / Math.max(1, view.pot + legal.callAmount)
  const tight = style.tightness
  const agg = style.aggression

  const shove = () => wager(legal, legal.maxWager)
  const minBet = () => wager(legal, legal.minWager)
  const potBet = () => {
    const sized = legal.wagerIsRaise
      ? legal.minWager + Math.floor(view.pot / 2)
      : Math.max(legal.minWager, view.pot || view.bigBlind)
    return wager(legal, sized)
  }

  if (view.street === "preflop") {
    if (strength >= 28) {
      if (legal.canWager && rng() < 0.85) return rng() < 0.15 ? shove() : potBet()
      if (legal.call) return { type: "call" }
    }
    if (strength >= 20) {
      if (legal.canWager && rng() < 0.45 + agg * 0.4) return minBet()
      if (legal.call && pressure < 0.45) return { type: "call" }
      if (legal.check) return { type: "check" }
    }
    if (strength >= 14 - tight * 4) {
      if (!legal.wagerIsRaise && legal.canWager && rng() < agg * 0.35) return minBet()
      if (legal.call && legal.callAmount <= view.bigBlind * (tight > 0.6 ? 2 : 4)) return { type: "call" }
      if (legal.check) return { type: "check" }
    }
    if (legal.check) return { type: "check" }
    if (legal.call && legal.callAmount <= view.bigBlind && rng() > tight) return { type: "call" }
    if (legal.fold) return { type: "fold" }
    if (legal.call) return { type: "call" }
    return { type: "check" }
  }

  const made = strength
  if (made >= 6) {
    if (legal.canWager && rng() < 0.55 + agg * 0.4) return rng() < 0.2 ? shove() : potBet()
    if (legal.call) return { type: "call" }
    if (legal.check && legal.canWager && rng() < agg) return potBet()
    if (legal.check) return { type: "check" }
  }
  if (made >= 4 || (made === 3 && rng() < 0.8)) {
    if (legal.canWager && (legal.callAmount === 0 || rng() < agg)) return rng() < 0.7 ? minBet() : potBet()
    if (legal.call) return { type: "call" }
    if (legal.check) return { type: "check" }
  }
  if (made === 2 || made === 3) {
    if (legal.callAmount === 0) {
      if (legal.canWager && rng() < 0.25 + agg * 0.45) return minBet()
      if (legal.check) return { type: "check" }
    }
    if (legal.call && pressure < 0.4 + (1 - tight) * 0.15) return { type: "call" }
    if (legal.check) return { type: "check" }
    if (legal.fold) return { type: "fold" }
  }
  if (draw && legal.call && pressure < 0.38) {
    if (legal.canWager && rng() < agg * 0.45) return minBet()
    return { type: "call" }
  }
  if (legal.callAmount === 0) {
    if (legal.canWager && rng() < agg * 0.18) return minBet()
    if (legal.check) return { type: "check" }
  }
  if (legal.fold && (pressure > 0.25 || rng() < tight)) return { type: "fold" }
  if (legal.check) return { type: "check" }
  if (legal.call && pressure < 0.2 && rng() > tight) return { type: "call" }
  if (legal.fold) return { type: "fold" }
  if (legal.call) return { type: "call" }
  return { type: "check" }
}

function wager(legal: LegalActions, amount: number): PlayerAction {
  return { type: "wager", amount: clampWager(legal, amount) }
}

function clampWager(legal: LegalActions, amount: number): number {
  if (legal.maxWager < legal.minWager) return legal.maxWager
  return Math.max(legal.minWager, Math.min(legal.maxWager, amount))
}

function preflopScore(hole: [Card, Card]): number {
  const high = Math.max(hole[0].rank, hole[1].rank)
  const low = Math.min(hole[0].rank, hole[1].rank)
  const pair = hole[0].rank === hole[1].rank
  const suited = hole[0].suit === hole[1].suit
  const gap = high - low
  let score = pair ? high * 2 : high + low / 10
  if (suited) score += 2
  if (!pair && gap === 1) score += 1
  if (!pair && gap === 2) score -= 1
  if (!pair && gap >= 4) score -= 3
  if (high === 14 && low >= 10) score += 2
  if (pair && high >= 12) score += 4
  return score
}

function postflopCategory(view: BotView): number {
  return evaluate([...view.hole, ...view.board]).score[0] ?? 0
}

function hasDraw(hole: [Card, Card], board: Card[]): boolean {
  const cards = [...hole, ...board]
  const suits = new Map<string, number>()
  for (const card of cards) suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1)
  if ([...suits.values()].some((count) => count === 4)) return true
  const ranks = [...new Set(cards.map((card) => card.rank))].sort((a, b) => a - b)
  const withWheel = ranks.includes(14) ? [1, ...ranks] : ranks
  let run = 1
  for (let i = 1; i < withWheel.length; i++) {
    if (withWheel[i] === withWheel[i - 1] + 1) {
      run += 1
      if (run >= 4) return true
    } else if (withWheel[i] !== withWheel[i - 1]) {
      run = 1
    }
  }
  return false
}

export const BOT_ROSTER: { name: string; emoji: string; color: string; style: BotStyle }[] = [
  { name: "Bluff Bot", emoji: "🦊", color: "#f97316", style: { tightness: 0.25, aggression: 0.85 } },
  { name: "Check Bot", emoji: "🐼", color: "#22c55e", style: { tightness: 0.55, aggression: 0.15 } },
  { name: "River Bot", emoji: "🐸", color: "#14b8a6", style: { tightness: 0.45, aggression: 0.55 } },
  { name: "Pocket Pete", emoji: "🐧", color: "#3b82f6", style: { tightness: 0.72, aggression: 0.4 } },
  { name: "Value Vera", emoji: "🦄", color: "#a855f7", style: { tightness: 0.5, aggression: 0.7 } },
  { name: "Foldsworth", emoji: "🐢", color: "#84cc16", style: { tightness: 0.86, aggression: 0.2 } },
  { name: "All-in Andy", emoji: "🐯", color: "#ef4444", style: { tightness: 0.2, aggression: 0.95 } },
  { name: "Slowplay Sam", emoji: "🐙", color: "#6366f1", style: { tightness: 0.6, aggression: 0.35 } },
]

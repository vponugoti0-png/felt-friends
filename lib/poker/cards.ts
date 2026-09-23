export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const
export const SUITS = ["c", "d", "h", "s"] as const

export type Rank = (typeof RANKS)[number]
export type Suit = (typeof SUITS)[number]

export interface Card {
  rank: Rank
  suit: Suit
}

const RANK_FROM_CHAR: Record<string, Rank> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

const RANK_TO_CHAR: Record<number, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
}

export const RANK_NAME: Record<number, string> = {
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Jack",
  12: "Queen",
  13: "King",
  14: "Ace",
}

export const RANK_PLURAL: Record<number, string> = {
  2: "Twos",
  3: "Threes",
  4: "Fours",
  5: "Fives",
  6: "Sixes",
  7: "Sevens",
  8: "Eights",
  9: "Nines",
  10: "Tens",
  11: "Jacks",
  12: "Queens",
  13: "Kings",
  14: "Aces",
}

export function cardKey(card: Card): string {
  return `${RANK_TO_CHAR[card.rank]}${card.suit}`
}

export function parseCard(text: string): Card {
  const trimmed = text.trim()
  const suit = trimmed.slice(-1).toLowerCase() as Suit
  const rankChar = trimmed.slice(0, -1).toUpperCase()
  const rank = RANK_FROM_CHAR[rankChar]
  if (!rank || !SUITS.includes(suit)) {
    throw new Error(`Bad card: ${text}`)
  }
  return { rank, suit }
}

export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCard)
}

export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

export function shuffleDeck(rng: () => number = Math.random): Card[] {
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const current = deck[i]
    deck[i] = deck[j]
    deck[j] = current
  }
  return deck
}

export function rankLabel(rank: Rank | number): string {
  if (rank === 10) return "10"
  return RANK_TO_CHAR[rank] ?? String(rank)
}

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case "c":
      return "♣"
    case "d":
      return "♦"
    case "h":
      return "♥"
    case "s":
      return "♠"
  }
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "h" || suit === "d"
}

export function formatChips(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount)
}

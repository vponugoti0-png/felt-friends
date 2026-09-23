import { randomInt } from "node:crypto"

import { makeDeck, type Card } from "@/lib/poker/cards"

/** Fisher–Yates with a CSPRNG. Server only — never ship the result to clients. */
export function secureDeck(): Card[] {
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1)
    const current = deck[i]
    deck[i] = deck[j]
    deck[j] = current
  }
  return deck
}

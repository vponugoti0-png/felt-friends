import { cardKey, type Card } from "@/lib/poker/cards"
import { evaluate, type HandValue } from "@/lib/poker/evaluator"
import { settlePots, type PotResult } from "@/lib/poker/pots"

export type Street = "preflop" | "flop" | "turn" | "river"
export type HandPhase = "betting" | "between-streets" | "complete"

export type PlayerAction =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "wager"; amount: number }

export interface LegalActions {
  fold: boolean
  check: boolean
  call: boolean
  callAmount: number
  canWager: boolean
  /** Total street commitment required for a full min bet/raise. May exceed maxWager. */
  minWager: number
  /** Total street commitment if the player shoves. */
  maxWager: number
  wagerIsRaise: boolean
}

export interface SeatInput {
  id: string
  seat: number
  name: string
  stack: number
  isBot?: boolean
}

export interface HandPlayer {
  id: string
  seat: number
  name: string
  stack: number
  committed: number
  streetBet: number
  folded: boolean
  allIn: boolean
  acted: boolean
  hole: [Card, Card] | null
  isBot: boolean
  startingStack: number
}

export interface HandActionRecord {
  playerId: string
  street: Street
  type: "blind" | "fold" | "check" | "call" | "bet" | "raise" | "allin"
  amount: number
  text: string
}

export interface WinnerPayout {
  playerId: string
  name: string
  seat: number
  amount: number
  handName?: string
  hole?: [Card, Card]
}

export interface RevealedHand {
  playerId: string
  hole: [Card, Card]
  handName: string
  bestFive: Card[]
  score: number[]
}

export interface HandResult {
  reason: "fold" | "showdown"
  board: Card[]
  payouts: WinnerPayout[]
  returned: { playerId: string; amount: number }[]
  pots: PotResult[]
  revealed: RevealedHand[]
}

export interface HandConfig {
  seats: SeatInput[]
  buttonSeat: number
  smallBlind: number
  bigBlind: number
  deck: Card[]
  maxSeats?: number
}

const EMPTY_LEGAL: LegalActions = {
  fold: false,
  check: false,
  call: false,
  callAmount: 0,
  canWager: false,
  minWager: 0,
  maxWager: 0,
  wagerIsRaise: false,
}

export class PokerHand {
  readonly players: HandPlayer[]
  readonly buttonSeat: number
  readonly smallBlind: number
  readonly bigBlind: number
  readonly maxSeats: number
  readonly startingTotal: number

  board: Card[] = []
  street: Street = "preflop"
  phase: HandPhase = "betting"
  currentBet = 0
  minRaise = 0
  toActId: string | null = null
  actionLog: HandActionRecord[] = []
  result: HandResult | null = null

  sbPlayerId = ""
  bbPlayerId = ""

  private deck: Card[]

  constructor(config: HandConfig) {
    if (!Number.isInteger(config.smallBlind) || config.smallBlind < 1) {
      throw new Error("Small blind must be a positive integer")
    }
    if (!Number.isInteger(config.bigBlind) || config.bigBlind <= config.smallBlind) {
      throw new Error("Big blind must be greater than the small blind")
    }
    this.buttonSeat = config.buttonSeat
    this.smallBlind = config.smallBlind
    this.bigBlind = config.bigBlind
    this.maxSeats = config.maxSeats ?? 9
    this.minRaise = config.bigBlind
    this.deck = config.deck.slice()
    this.players = config.seats
      .filter((seat) => seat.stack > 0)
      .map((seat) => ({
        id: seat.id,
        seat: seat.seat,
        name: seat.name,
        stack: seat.stack,
        committed: 0,
        streetBet: 0,
        folded: false,
        allIn: false,
        acted: false,
        hole: null,
        isBot: Boolean(seat.isBot),
        startingStack: seat.stack,
      }))
      .sort((a, b) => a.seat - b.seat)

    if (this.players.length < 2 || this.players.length > this.maxSeats) {
      throw new Error("A hand needs 2 to 9 players with chips")
    }
    if (!this.players.some((player) => player.seat === this.buttonSeat)) {
      throw new Error("Button must sit on a player in the hand")
    }
    const seen = new Set<number>()
    for (const player of this.players) {
      if (seen.has(player.seat)) throw new Error("Duplicate seat")
      seen.add(player.seat)
    }
    this.startingTotal = this.players.reduce((sum, player) => sum + player.stack, 0)
  }

  start(): void {
    this.postBlinds()
    this.dealHoleCards()
    this.openStreet("preflop")
  }

  act(playerId: string, action: PlayerAction): void {
    if (this.phase !== "betting") throw new Error("No betting action right now")
    if (this.toActId !== playerId) throw new Error("It is not your turn")
    const player = this.player(playerId)
    const legal = this.legalActions(playerId)

    if (action.type === "fold") {
      if (!legal.fold) throw new Error("You can check — no need to fold")
      player.folded = true
      player.acted = true
      this.record(player, "fold", 0, `${player.name} folds`)
    } else if (action.type === "check") {
      if (!legal.check) throw new Error("You cannot check")
      player.acted = true
      this.record(player, "check", 0, `${player.name} checks`)
    } else if (action.type === "call") {
      if (!legal.call) throw new Error("There is nothing to call")
      this.collectExact(player, legal.callAmount)
      player.acted = true
      const label = player.allIn ? `${player.name} calls all-in` : `${player.name} calls ${legal.callAmount}`
      this.record(player, player.allIn ? "allin" : "call", legal.callAmount, label)
    } else if (action.type === "wager") {
      this.applyWager(player, action.amount, legal)
    } else {
      throw new Error("Unknown action")
    }

    this.resolve(player.seat)
  }

  legalActions(playerId: string): LegalActions {
    if (this.phase !== "betting" || this.toActId !== playerId) return { ...EMPTY_LEGAL }
    const player = this.players.find((candidate) => candidate.id === playerId)
    if (!player || player.folded || player.allIn) return { ...EMPTY_LEGAL }

    const toCall = Math.max(0, this.currentBet - player.streetBet)
    const facingBet = toCall > 0
    const maxWager = player.streetBet + player.stack
    const othersCanRespond = this.players.some(
      (other) => other.id !== player.id && !other.folded && !other.allIn,
    )
    const minWager = facingBet ? this.currentBet + this.minRaise : player.streetBet + this.bigBlind
    const canWager =
      othersCanRespond &&
      player.stack > toCall &&
      (!facingBet || !player.acted)

    return {
      fold: facingBet,
      check: !facingBet,
      call: facingBet && player.stack > 0,
      callAmount: Math.min(toCall, player.stack),
      canWager,
      minWager,
      maxWager,
      wagerIsRaise: facingBet,
    }
  }

  /** Fold a player immediately. Used when they are kicked or leave mid-hand. */
  forceFold(playerId: string): void {
    if (this.phase === "complete") return
    const player = this.players.find((candidate) => candidate.id === playerId)
    if (!player || player.folded) return
    player.folded = true
    player.acted = true
    this.record(player, "fold", 0, `${player.name} folds`)
    if (this.players.filter((candidate) => !candidate.folded).length <= 1) {
      this.finish("fold")
      return
    }
    if (this.phase === "between-streets") return
    if (this.toActId === playerId) {
      this.resolve(player.seat)
      return
    }
    if (this.toActId) {
      const actor = this.players.find((candidate) => candidate.id === this.toActId)
      if (actor && !this.needsAction(actor)) this.resolve(actor.seat)
    }
  }

  dealNext(): void {
    if (this.phase !== "between-streets") throw new Error("The street is not finished")
    if (this.street === "preflop") {
      this.burn()
      this.board.push(this.draw(), this.draw(), this.draw())
      this.street = "flop"
    } else if (this.street === "flop") {
      this.burn()
      this.board.push(this.draw())
      this.street = "turn"
    } else if (this.street === "turn") {
      this.burn()
      this.board.push(this.draw())
      this.street = "river"
    } else {
      throw new Error("No more cards to deal")
    }
    this.openStreet("postflop")
  }

  /** Chips still behind plus chips committed this hand. Equals startingTotal until showdown pays out. */
  chipsInPlay(): number {
    return this.players.reduce((sum, player) => sum + player.stack + player.committed, 0)
  }

  get potTotal(): number {
    return this.players.reduce((sum, player) => sum + player.committed, 0)
  }

  get collectedPot(): number {
    return this.players.reduce((sum, player) => sum + (player.committed - player.streetBet), 0)
  }

  private postBlinds(): void {
    const small = this.players.length === 2 ? this.playerBySeat(this.buttonSeat) : this.clockwise(this.buttonSeat)
    const big = this.clockwise(small.seat)
    this.sbPlayerId = small.id
    this.bbPlayerId = big.id
    this.postBlind(small, this.smallBlind, "small blind")
    this.postBlind(big, this.bigBlind, "big blind")
  }

  private postBlind(player: HandPlayer, amount: number, label: string): void {
    const pay = Math.min(player.stack, amount)
    player.stack -= pay
    player.committed += pay
    player.streetBet += pay
    if (player.stack === 0) player.allIn = true
    this.record(player, "blind", pay, `${player.name} posts ${label} ${pay}`)
  }

  private dealHoleCards(): void {
    const order = this.orderFrom(this.clockwise(this.buttonSeat).seat)
    const first: Card[] = []
    const second: Card[] = []
    for (let i = 0; i < order.length; i++) first.push(this.draw())
    for (let i = 0; i < order.length; i++) second.push(this.draw())
    order.forEach((player, index) => {
      player.hole = [first[index], second[index]]
    })
  }

  private openStreet(which: "preflop" | "postflop"): void {
    if (which === "postflop") {
      for (const player of this.players) player.streetBet = 0
      this.currentBet = 0
      this.minRaise = this.bigBlind
    } else {
      this.currentBet = this.players.reduce((max, player) => Math.max(max, player.streetBet), 0)
      this.minRaise = this.bigBlind
    }
    for (const player of this.players) {
      player.acted = player.folded || player.allIn
    }
    this.toActId = null
    if (!this.canHaveAction()) {
      this.closeStreet()
      return
    }
    this.phase = "betting"
    this.resolve(null)
  }

  private canHaveAction(): boolean {
    const active = this.players.filter((player) => !player.folded && !player.allIn)
    if (active.length >= 2) return true
    if (active.length === 1) return active[0].streetBet < this.currentBet
    return false
  }

  private applyWager(player: HandPlayer, target: number, legal: LegalActions): void {
    if (!legal.canWager) throw new Error("You cannot bet or raise right now")
    if (!Number.isInteger(target)) throw new Error("Bets must be whole chips")
    if (target > legal.maxWager) throw new Error("That is more than your stack")
    if (target <= player.streetBet || target <= this.currentBet) {
      throw new Error("A bet has to put more chips in than the current bet")
    }
    const shortAllIn = target === legal.maxWager && target < legal.minWager
    if (target < legal.minWager && !shortAllIn) {
      throw new Error(`Minimum raise is ${legal.minWager}`)
    }

    const facing = this.currentBet > 0
    const increase = target - this.currentBet
    this.collectExact(player, target - player.streetBet)
    const full = increase >= this.minRaise
    this.currentBet = player.streetBet
    if (full) {
      this.minRaise = increase
      for (const other of this.players) {
        if (other.id !== player.id && !other.folded && !other.allIn) other.acted = false
      }
    }
    player.acted = true
    const verb = player.allIn ? "all-in" : facing ? "raises to" : "bets"
    const text = player.allIn
      ? `${player.name} is all-in for ${player.streetBet}`
      : `${player.name} ${verb} ${player.streetBet}`
    this.record(player, player.allIn ? "allin" : facing ? "raise" : "bet", player.streetBet, text)
  }

  private collectExact(player: HandPlayer, amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) throw new Error("Invalid chip amount")
    if (amount > player.stack) throw new Error("Not enough chips")
    player.stack -= amount
    player.committed += amount
    player.streetBet += amount
    if (player.stack === 0) player.allIn = true
  }

  private resolve(actorSeat: number | null): void {
    if (this.players.filter((player) => !player.folded).length <= 1) {
      this.finish("fold")
      return
    }
    const next =
      actorSeat === null
        ? this.findNeeding(this.firstToActSeat(), true)
        : this.findNeeding(actorSeat, false)
    if (!next) {
      this.closeStreet()
      return
    }
    this.toActId = next.id
    this.phase = "betting"
  }

  private closeStreet(): void {
    this.toActId = null
    if (this.players.filter((player) => !player.folded).length <= 1) {
      this.finish("fold")
      return
    }
    if (this.street === "river") {
      this.finish("showdown")
      return
    }
    this.phase = "between-streets"
  }

  private finish(reason: "fold" | "showdown"): void {
    if (this.result) return
    const ranks = new Map<string, HandValue>()
    if (reason === "showdown") {
      for (const player of this.players) {
        if (player.folded || !player.hole) continue
        if (this.board.length < 5) {
          throw new Error("Showdown requires a full board")
        }
        ranks.set(player.id, evaluate([...player.hole, ...this.board]))
      }
    }

    const settlement = settlePots(
      this.players.map((player) => ({
        id: player.id,
        committed: player.committed,
        folded: player.folded,
        seat: player.seat,
      })),
      this.buttonSeat,
      this.maxSeats,
      (id) => ranks.get(id)?.score ?? null,
      (id) => ranks.get(id)?.name,
    )

    for (const returned of settlement.returned) {
      const player = this.player(returned.playerId)
      player.stack += returned.amount
      player.committed -= returned.amount
    }
    for (const award of settlement.awards) {
      this.player(award.playerId).stack += award.amount
    }

    const revealed: RevealedHand[] = []
    if (reason === "showdown") {
      for (const player of this.players) {
        if (player.folded || !player.hole) continue
        const value = ranks.get(player.id)
        if (!value) continue
        revealed.push({
          playerId: player.id,
          hole: player.hole,
          handName: value.name,
          bestFive: value.bestFive,
          score: value.score,
        })
      }
    }

    const payouts: WinnerPayout[] = settlement.awards
      .filter((award) => award.amount > 0)
      .map((award) => {
        const player = this.player(award.playerId)
        const shown = revealed.find((hand) => hand.playerId === award.playerId)
        return {
          playerId: player.id,
          name: player.name,
          seat: player.seat,
          amount: award.amount,
          handName: shown?.handName,
          hole: shown?.hole,
        }
      })

    this.result = {
      reason,
      board: this.board.slice(),
      payouts,
      returned: settlement.returned,
      pots: settlement.pots,
      revealed,
    }
    this.phase = "complete"
    this.toActId = null
  }

  private firstToActSeat(): number {
    if (this.street === "preflop") {
      if (this.players.length === 2) return this.player(this.sbPlayerId).seat
      return this.clockwise(this.player(this.bbPlayerId).seat).seat
    }
    return this.clockwise(this.buttonSeat).seat
  }

  private findNeeding(startSeat: number, inclusive: boolean): HandPlayer | null {
    let seat = inclusive ? startSeat : (startSeat + 1) % this.maxSeats
    for (let i = 0; i < this.maxSeats; i++) {
      const player = this.players.find((candidate) => candidate.seat === seat)
      if (player && this.needsAction(player)) return player
      seat = (seat + 1) % this.maxSeats
    }
    return null
  }

  private needsAction(player: HandPlayer): boolean {
    if (player.folded || player.allIn) return false
    if (!player.acted) return true
    return player.streetBet < this.currentBet
  }

  private clockwise(seat: number): HandPlayer {
    let best: HandPlayer | null = null
    let first: HandPlayer | null = null
    for (const player of this.players) {
      if (!first || player.seat < first.seat) first = player
      if (player.seat > seat && (!best || player.seat < best.seat)) best = player
    }
    if (!first) throw new Error("No players")
    return best ?? first
  }

  private orderFrom(startSeat: number): HandPlayer[] {
    const start = this.playerBySeat(startSeat)
    const order = [start]
    let cursor = start
    for (let i = 1; i < this.players.length; i++) {
      cursor = this.clockwise(cursor.seat)
      order.push(cursor)
    }
    return order
  }

  private draw(): Card {
    const card = this.deck.shift()
    if (!card) throw new Error("Deck is empty")
    return card
  }

  private burn(): void {
    this.draw()
  }

  private record(player: HandPlayer, type: HandActionRecord["type"], amount: number, text: string): void {
    this.actionLog.push({
      playerId: player.id,
      street: this.street,
      type,
      amount,
      text,
    })
  }

  private player(id: string): HandPlayer {
    const player = this.players.find((candidate) => candidate.id === id)
    if (!player) throw new Error("Unknown player")
    return player
  }

  private playerBySeat(seat: number): HandPlayer {
    const player = this.players.find((candidate) => candidate.seat === seat)
    if (!player) throw new Error(`No player in seat ${seat}`)
    return player
  }
}

export function bestFiveKeys(cards: Card[]): string[] {
  return cards.map(cardKey)
}

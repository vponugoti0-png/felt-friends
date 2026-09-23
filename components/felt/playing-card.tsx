import { isRedSuit, rankLabel, suitSymbol, type Card } from "@/lib/poker/cards"
import { cn } from "cn"

export function PlayingCard({
  card,
  faceDown = false,
  mini = false,
  delay = 0,
  highlight = false,
}: {
  card?: Card | null
  faceDown?: boolean
  mini?: boolean
  delay?: number
  highlight?: boolean
}) {
  const red = card ? isRedSuit(card.suit) : false
  return (
    <div
      className={cn(
        "playing-card card-deal",
        mini && "mini",
        (faceDown || !card) && "back",
        red && "red",
        highlight && "ring-2 ring-[#e4c36a]",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {card && !faceDown ? (
        <>
          <span className="text-[13px] leading-none">{rankLabel(card.rank)}</span>
          <span className="self-center text-lg leading-none">{suitSymbol(card.suit)}</span>
          <span className="rotate-180 self-end text-[13px] leading-none">{rankLabel(card.rank)}</span>
        </>
      ) : null}
    </div>
  )
}

import { cn } from "cn"

const DENOMS: { value: number; color: string; edge: string }[] = [
  { value: 5000, color: "#f97316", edge: "#7c2d12" },
  { value: 1000, color: "#facc15", edge: "#854d0e" },
  { value: 500, color: "#a855f7", edge: "#581c87" },
  { value: 100, color: "#171717", edge: "#e5e5e5" },
  { value: 25, color: "#2563eb", edge: "#dbeafe" },
  { value: 5, color: "#dc2626", edge: "#fecaca" },
  { value: 1, color: "#f8fafc", edge: "#94a3b8" },
]

export function ChipStack({ amount, className }: { amount: number; className?: string }) {
  if (amount <= 0) return null
  const chips = breakChips(amount).slice(0, 8)
  return (
    <div className={cn("flex items-end gap-0.5", className)} aria-hidden>
      {chips.map((chip, index) => (
        <span
          key={`${chip.color}-${index}`}
          className="inline-block size-3.5 rounded-full border-2 shadow"
          style={{ background: chip.color, borderColor: chip.edge, marginLeft: index === 0 ? 0 : -4 }}
        />
      ))}
    </div>
  )
}

function breakChips(amount: number) {
  const chips: { color: string; edge: string }[] = []
  let left = amount
  for (const denom of DENOMS) {
    let count = Math.floor(left / denom.value)
    left -= count * denom.value
    count = Math.min(count, 4)
    for (let i = 0; i < count; i++) chips.push(denom)
    if (chips.length >= 8) break
  }
  if (chips.length === 0) chips.push(DENOMS[DENOMS.length - 1])
  return chips
}

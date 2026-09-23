export const SEAT_SLOTS = [
  { x: 50, y: 90 },
  { x: 15, y: 76 },
  { x: 4, y: 50 },
  { x: 13, y: 23 },
  { x: 33, y: 7 },
  { x: 67, y: 7 },
  { x: 87, y: 23 },
  { x: 96, y: 50 },
  { x: 85, y: 76 },
]

export function visualIndex(seat: number, heroSeat: number | null) {
  if (heroSeat === null) return seat
  return (seat - heroSeat + 9) % 9
}

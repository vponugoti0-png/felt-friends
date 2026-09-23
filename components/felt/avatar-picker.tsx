"use client"

import { AVATAR_COLORS, AVATAR_EMOJIS, type Avatar } from "@/lib/game/protocol"
import { cn } from "cn"

export function AvatarPicker({
  value,
  onChange,
}: {
  value: Avatar
  onChange: (avatar: Avatar) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Avatar ${emoji}`}
            onClick={() => onChange({ ...value, emoji })}
            className={cn(
              "grid size-9 place-items-center rounded-full bg-white/5 text-lg",
              value.emoji === emoji && "ring-2 ring-[#e4c36a]",
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label="Avatar color"
            onClick={() => onChange({ ...value, color })}
            className={cn("size-6 rounded-full", value.color === color && "ring-2 ring-white ring-offset-2 ring-offset-[#141820]")}
            style={{ background: color }}
          />
        ))}
      </div>
    </div>
  )
}

export function AvatarBubble({
  avatar,
  name,
  ring,
}: {
  avatar: Avatar
  name: string
  ring?: boolean
}) {
  return (
    <div
      className={cn(
        "grid size-12 place-items-center rounded-full text-xl shadow-lg",
        ring && "turn-pulse",
      )}
      style={{ background: avatar.color }}
      aria-hidden
    >
      <span className="drop-shadow">{avatar.emoji}</span>
      <span className="sr-only">{name}</span>
    </div>
  )
}

"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { AvatarPicker } from "@/components/felt/avatar-picker"
import { useSettings } from "@/components/providers"

export function SettingsDialog({
  open,
  onOpenChange,
  onRename,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename?: (name: string) => void
}) {
  const { settings, update } = useSettings()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Table settings</DialogTitle>
          <DialogDescription>Saved in this browser. Chips only — never real money.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={settings.name}
              maxLength={16}
              placeholder="River"
              onChange={(event) => update({ name: event.target.value })}
              onBlur={() => {
                if (settings.name.trim().length >= 2) onRename?.(settings.name.trim())
              }}
            />
          </div>
          <AvatarPicker value={settings.avatar} onChange={(avatar) => update({ avatar })} />
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="sound">Sound effects</Label>
            <Switch id="sound" checked={settings.sound} onCheckedChange={(sound) => update({ sound })} />
          </div>
          <div className="space-y-2">
            <Label>Volume</Label>
            <Slider
              min={0}
              max={100}
              value={[Math.round(settings.volume * 100)]}
              onValueChange={(value) => update({ volume: (Array.isArray(value) ? value[0] : value) / 100 })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="motion">Reduce motion</Label>
            <Switch
              id="motion"
              checked={settings.reduceMotion}
              onCheckedChange={(reduceMotion) => update({ reduceMotion })}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

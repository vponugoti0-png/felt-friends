"use client"

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  readServerSettings,
  readSettingsSnapshot,
  saveSettings,
  subscribeSettings,
  type Settings,
} from "@/lib/client/settings"

interface SettingsApi {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsApi | null>(null)

export function useSettings() {
  const value = useContext(SettingsContext)
  if (!value) throw new Error("Settings missing")
  return value
}

export function Providers({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(subscribeSettings, readSettingsSnapshot, readServerSettings)

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion)
  }, [settings.reduceMotion])

  const api = useMemo<SettingsApi>(
    () => ({
      settings,
      update: (patch) => {
        const next = { ...settings, ...patch }
        saveSettings(next)
      },
    }),
    [settings],
  )

  return (
    <ThemeProvider attribute="class" forcedTheme="dark" defaultTheme="dark" enableSystem={false}>
      <SettingsContext.Provider value={api}>
        <TooltipProvider>
          {children}
          <Toaster theme="dark" position="top-center" />
        </TooltipProvider>
      </SettingsContext.Provider>
    </ThemeProvider>
  )
}

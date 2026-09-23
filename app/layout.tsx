import type { Metadata } from "next"
import { Fraunces, Outfit } from "next/font/google"

import { Providers } from "@/components/providers"
import "./globals.css"

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
})

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Felt Friends",
  description: "Private no-limit Texas Hold'em for friends. Play chips only — no real-money gambling.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} dark h-full antialiased`}>
      <body className="min-h-dvh bg-[#07080d] text-[#f6f1e6]">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

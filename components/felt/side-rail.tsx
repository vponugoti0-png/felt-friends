"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlayingCard } from "@/components/felt/playing-card"
import { REACTIONS, type ChatMessage, type HandHistoryEntry, type PublicPlayer } from "@/lib/game/protocol"
import { formatChips, cardKey } from "@/lib/poker/cards"

export function SideRail({
  chat,
  history,
  players,
  isHost,
  paused,
  onChat,
  onReact,
  onKick,
  onPause,
  onBlinds,
  onAddBot,
  onRemoveBot,
  onStart,
  onStop,
  smallBlind,
  bigBlind,
}: {
  chat: ChatMessage[]
  history: HandHistoryEntry[]
  players: PublicPlayer[]
  isHost: boolean
  paused: boolean
  onChat: (text: string) => void
  onReact: (emoji: string) => void
  onKick: (playerId: string) => void
  onPause: (paused: boolean) => void
  onBlinds: (smallBlind: number, bigBlind: number) => void
  onAddBot: () => void
  onRemoveBot: (playerId: string) => void
  onStart: () => void
  onStop: () => void
  smallBlind: number
  bigBlind: number
}) {
  const [text, setText] = useState("")
  const [sb, setSb] = useState(String(smallBlind))
  const [bb, setBb] = useState(String(bigBlind))

  return (
    <Tabs defaultValue="chat" className="flex h-full min-h-0 flex-col">
      <TabsList className="mx-3 mt-3 grid w-auto grid-cols-3">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="history">Hands</TabsTrigger>
        <TabsTrigger value="host">Host</TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-full bg-white/5 px-2 py-1 text-base hover:bg-white/10"
              onClick={() => onReact(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {chat.length === 0 ? <p className="text-sm text-[#b7ab96]">Table talk stays with the room.</p> : null}
          {chat.map((message) => (
            <p key={message.id} className="text-sm">
              <span className="font-medium text-[#e4c36a]">
                {message.name}
                {message.spectator ? " · watching" : ""}
              </span>{" "}
              <span className="text-[#f6f1e6]">{message.text}</span>
            </p>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!text.trim()) return
            onChat(text)
            setText("")
          }}
        >
          <Input
            value={text}
            maxLength={160}
            placeholder="Say something kind"
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit">Send</Button>
        </form>
      </TabsContent>
      <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {history.length === 0 ? <p className="text-sm text-[#b7ab96]">No hands yet this session.</p> : null}
        <div className="space-y-3">
          {[...history].reverse().map((hand) => (
            <article key={hand.handNumber} className="rounded-xl bg-white/5 p-3">
              <header className="mb-2 flex items-center justify-between text-xs text-[#b7ab96]">
                <span>Hand {hand.handNumber}</span>
                <span>{formatChips(hand.pot)} pot</span>
              </header>
              <div className="mb-2 flex gap-1">
                {hand.board.length === 0 ? (
                  <span className="text-xs text-[#b7ab96]">No board</span>
                ) : (
                  hand.board.map((card) => <PlayingCard key={cardKey(card)} card={card} mini />)
                )}
              </div>
              {hand.winners.map((winner) => (
                <p key={`${hand.handNumber}-${winner.name}-${winner.amount}`} className="text-sm">
                  {winner.name} +{formatChips(winner.amount)}
                  {winner.handName ? ` · ${winner.handName}` : ""}
                </p>
              ))}
            </article>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="host" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {isHost ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onStart}>
                Deal
              </Button>
              <Button type="button" variant="secondary" onClick={() => onPause(!paused)}>
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button type="button" variant="outline" onClick={onStop}>
                Stop
              </Button>
              <Button type="button" variant="outline" onClick={onAddBot}>
                Add bot
              </Button>
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                onBlinds(Number(sb), Number(bb))
              }}
            >
              <label className="text-xs text-[#b7ab96]">
                SB
                <Input value={sb} onChange={(event) => setSb(event.target.value)} inputMode="numeric" />
              </label>
              <label className="text-xs text-[#b7ab96]">
                BB
                <Input value={bb} onChange={(event) => setBb(event.target.value)} inputMode="numeric" />
              </label>
              <Button type="submit" variant="secondary">
                Set
              </Button>
            </form>
            <ul className="space-y-2">
              {players.map((player) => (
                <li key={player.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {player.avatar.emoji} {player.name}
                    {player.isBot ? " · bot" : ""}
                  </span>
                  {player.isBot ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onRemoveBot(player.id)}>
                      Remove
                    </Button>
                  ) : player.isHost ? null : (
                    <Button type="button" size="sm" variant="destructive" onClick={() => onKick(player.id)}>
                      Kick
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-[#b7ab96]">The host deals, pauses, changes blinds, and invites bots.</p>
        )}
      </TabsContent>
    </Tabs>
  )
}

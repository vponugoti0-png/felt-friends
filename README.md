# Felt Friends

Private no-limit Texas Hold'em for friends. Create a room, share a short code, and play for chips. There is no real-money gambling, no accounts, and no cash-out.

Rooms live in memory on one server process. A restart clears every table. That is intentional for this friends-night build; Redis can come later if you want rooms to survive deploys.

## Run locally

```bash
npm install
npm test
npm run dev
```

The app listens on `PORT` or **3847**. Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

Production build:

```bash
npm run build
npm start
```

`npm start` runs `node dist/server.js`, which serves Next.js and Socket.IO on the same port.

## Play a game

1. On the lobby, pick a display name and avatar, then **Create room**. Defaults are 50/100 blinds, a 10,000 chip stack, and a 25 second action clock.
2. Copy the room code or the invite link (`/room/CODE`) and send it to friends.
3. They join with a display name, or choose **Watch** to spectate.
4. The host deals when at least two seats have chips. **Add bot** fills empty seats so you can play solo. Bots are labeled **BOT**.
5. The dealer runs blinds, betting, side pots, showdown, and the next hand. Refreshing the same browser restores your seat.

Rooms are unlisted unless you turn on **List this room in the lobby**.

## Checks

```bash
npm test          # evaluator, side pots, full hands, room flow
npm run build
npm run smoke     # needs the server already running; SMOKE_URL overrides the target
```

Smoke creates a room, seats a second player and a bot, and plays until showdown.

## Railway

One web service. No secrets.

| Setting | Value |
| --- | --- |
| Config | `railway.json` + `Dockerfile` |
| Start | `node dist/server.js` (image `CMD`) |
| Port | `PORT` assigned by Railway (the server binds `0.0.0.0`) |
| Health | `GET /api/health` |
| Env | `PORT`, `NODE_ENV=production` |

From this directory, after `railway login`:

```bash
railway up -y
```

Rooms will reset whenever the service restarts or scales past one instance. Run a single replica.

## What shipped

- No-limit Hold'em for 2–9 players: blinds, button, min-raise, short all-ins, action clock (auto-check or auto-fold), sit out / sit in
- Side pots, split pots, odd-chip rule, showdown names ("Full House, Kings full of Nines")
- Server-side shuffle, hole cards, and pot math
- Optional bot seats, spectators, rebuys, or a winner-take-all sit & go
- Host tools: deal, pause between hands, blinds, kick, add/remove bots, stop
- Felt table, chip stacks, deal and bet motion, synthesized sound with mute and volume, turn timer, winner callout
- Chat with length and rate limits, emoji reactions, hand history, reconnect via the browser session
- Desktop and mobile layouts, including a landscape-friendly table

## Known limits

- In-memory rooms only. No database, accounts, or multi-table tournaments.
- Sitting back in does not post missed blinds.
- A short all-in does not reopen betting. The next full raise must still increase the bet by at least the previous full bet or raise (a short opening shove does not shrink the minimum raise below one big blind).
- Bots are heuristic, not a solver.
- Odd chips in a split go to the earliest seat left of the button.

# Felt Friends

Private no-limit Texas Hold'em for friends. Create a room, share a short code, and play for chips. There is no real-money gambling, no accounts, and no cash-out.

Rooms live in memory on one server process. A restart clears private tables. The practice table is wiped too, then rebuilt with the same bot squad the next time someone opens the lobby. Redis can come later if you want rooms to survive deploys. Run a single replica so everyone shares that one table.

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

### Practice with bots

1. Type your name and press **Play with bots**.
2. You land on the standing practice table (`PRACT`). Bluff Bot, Check Bot, and River Bot are already seated.
3. Press **Deal**. The bots stay for the next hand. The host can **Add ready group**, add one bot style, or **Clear bots**.
4. Friends can open the same practice table from the lobby list (**Practice · bots ready**).

A restart clears the practice table. The next lobby visit builds it again with the same squad.

### Friends night

1. **Create a private room**. Your name starts blank. Blinds, starting chips, and time per decision sit under **Advanced** (defaults: 50/100, 10,000 chips, 25 seconds).
2. **Copy code** or **Share link** and send it. Anyone with the code can join — treat it like a party invite.
3. Friends use **Join with a code**, pick an avatar, and sit down, or **Watch**.
4. The host deals when at least two seats have chips. Refreshing the same browser restores your seat. A second tab of this browser asks before it takes the seat, so the first tab is not sat out in silence.

Private rooms stay unlisted unless you turn on **List this room in the lobby**.

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
- Host tools: deal, pause between hands, blinds, kick, ready bot group, one-tap add/remove bots, stop
- Standing practice table with a mixed bot squad that comes back after a restart
- Felt table, chip stacks, deal and bet motion, synthesized sound with mute and volume, turn timer, winner callout
- Chat with length and rate limits, emoji reactions, hand history, reconnect via the browser session
- Desktop and phone layouts. On a narrow screen opponents sit in a row above the board, you sit below it, and the action bar stays on screen. The page does not scroll sideways.
- All-in submits that shove immediately. Min, half-pot, and pot only set the slider until you tap Bet or Raise.
- A player who finishes a hand with zero chips is marked busted and sits out. They are not dealt again until a cash rebuy. Sit & go busts are eliminated.

## Known limits

- In-memory rooms only. No database, accounts, or multi-table tournaments. A restart clears the practice table; the next visit rebuilds it.
- Sitting back in does not post missed blinds.
- A short all-in does not reopen betting. The next full raise must still increase the bet by at least the previous full bet or raise (a short opening shove does not shrink the minimum raise below one big blind).
- Bots are heuristic, not a solver.
- Odd chips in a split go to the earliest seat left of the button.

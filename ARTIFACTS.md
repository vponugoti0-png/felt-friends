# Felt Friends source package

Checked in this follow-up on 2026-09-23.

- Start command: `node dist/server.js`
- Health: `GET /api/health`
- The server binds `0.0.0.0` and listens on `PORT` (local default 3847).
- `npm test`: passed, 4 files, 19 tests.
- `npm run build`: passed. Next.js 16.3.6 production build succeeded and `scripts/build-server.mjs` wrote `dist/server.js` (71.2kb). `dist` and `.next` are build outputs and are not included in this zip.

`npm start` runs `node dist/server.js` after `npm run build`. No secrets are required. Set `NODE_ENV=production` in production.

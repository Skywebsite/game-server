# RPS Backend (Render/Vercel ready)

Real-time Rock–Paper–Scissors backend with Socket.IO and MongoDB.

## Local dev

```bash
cd server
npm install
copy ENV.example .env  # on Windows; or cp ENV.example .env
npm run dev
```

Env keys in `.env`:

```
MONGODB_URI=mongodb+srv://RPS:RPS%4001@rps.iysayy5.mongodb.net/?appName=RPS
PORT=3001
CORS_ORIGIN=*
```

## Deploy

### Render (recommended for Socket.IO)
- New Web Service → select `server` folder.
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment: add `MONGODB_URI`, `PORT` (e.g. 10000), `CORS_ORIGIN`.

### Vercel (works for basic WebSockets via Node server)
- Project Settings → Root Directory: `server`
- Build Command: `npm run build`
- Output: `dist` (Node server)
- Development Command: `npm run dev`
- Environment Variables: `MONGODB_URI`, `PORT` (Vercel sets one), `CORS_ORIGIN`

Note: For serverless functions, Socket.IO is limited; prefer a long‑lived server (Render).

## Socket API (events)

- `joinRoom` → `{ roomId, name }` joins/creates a 2‑player room
  - Emits: `roomUpdate` or `roomFull`
- `choose` → `{ roomId, choice }` locks your pick
  - Emits to self: `choiceLocked`
  - Emits to peer: `opponentLocked`
  - When both chose: `result` → `{ winner, p1: {id, choice}, p2: {id, choice} }`

## Health

- `GET /health` → `{ ok: true }`



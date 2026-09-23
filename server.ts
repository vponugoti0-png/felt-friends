import { createServer } from "node:http"
import { parse } from "node:url"

import next from "next"
import { Server } from "socket.io"

import { attachGameServer } from "@/server/sockets"

const dev = process.env.NODE_ENV !== "production"
const hostname = "0.0.0.0"
const port = Number(process.env.PORT || 3847)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

async function main() {
  await app.prepare()

  const httpServer = createServer((req, res) => {
    const parsed = parse(req.url ?? "/", true)
    handle(req, res, parsed)
  })

  const io = new Server(httpServer, {
    transports: ["websocket", "polling"],
  })

  attachGameServer(io)

  httpServer.listen(port, hostname, () => {
    console.log(`Felt Friends ready on http://${hostname}:${port}`)
  })
}

void main()

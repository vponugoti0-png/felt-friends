import path from "node:path"
import { fileURLToPath } from "node:url"

import esbuild from "esbuild"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

await esbuild.build({
  entryPoints: [path.join(root, "server.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: path.join(root, "dist/server.js"),
  external: ["next", "socket.io"],
  alias: {
    "@": root,
  },
  logLevel: "info",
})

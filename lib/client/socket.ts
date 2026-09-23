"use client"

import { io, type Socket } from "socket.io-client"

const globalSocket = globalThis as typeof globalThis & { __feltSocket?: Socket }

export function getSocket() {
  if (!globalSocket.__feltSocket) {
    globalSocket.__feltSocket = io({
      autoConnect: true,
      transports: ["websocket", "polling"],
    })
  }
  return globalSocket.__feltSocket
}

export function emitAck<T>(event: string, payload?: unknown): Promise<T> {
  const socket = getSocket()
  return new Promise((resolve) => {
    socket.emit(event, payload ?? {}, (response: T) => resolve(response))
  })
}

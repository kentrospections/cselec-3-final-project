'use strict'
const http = require('http')
const net = require('net')
const crypto = require('crypto')

const BACKEND_HOST = process.env.BACKEND_HOST || 'cselec-3-backend'
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '8000', 10)
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

console.log('[ws-proxy] wrapper loaded, patching http.createServer')

const _createServer = http.createServer.bind(http)
http.createServer = function (optsOrHandler, maybeHandler) {
  const server = typeof optsOrHandler === 'function'
    ? _createServer(optsOrHandler)
    : _createServer(optsOrHandler, maybeHandler)

  // Our handler — handles /graphql WebSocket upgrades.
  function graphqlUpgradeHandler(req, socket, head) {
    if (!req.url.startsWith('/graphql')) return
    console.log('[ws-proxy] upgrade:', req.url)

    // Complete the WebSocket handshake with the client (NPM/browser) immediately.
    const key = req.headers['sec-websocket-key'] || ''
    const accept = crypto.createHash('sha1')
      .update(key + WS_MAGIC)
      .digest('base64')
    const protocol = req.headers['sec-websocket-protocol']
    const responseLines = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
    ]
    if (protocol) responseLines.push(`Sec-WebSocket-Protocol: ${protocol}`)
    socket.write(responseLines.join('\r\n') + '\r\n\r\n')

    // Pause the socket so no client frames are lost while setting up the backend.
    socket.pause()

    const upstream = net.connect(BACKEND_PORT, BACKEND_HOST)
    let backendReady = false
    let backendBuf = Buffer.alloc(0)

    upstream.on('connect', () => {
      // Forward the upgrade request to the backend so it enters WebSocket mode.
      // Strip sec-websocket-extensions so the backend doesn't negotiate
      // permessage-deflate and send RSV1=1 compressed frames — the browser
      // only agreed to extensions in our own 101, which includes none.
      const headerLines = [`GET ${req.url} HTTP/1.1`]
      for (const [k, v] of Object.entries(req.headers)) {
        if (k === 'sec-websocket-extensions') continue
        headerLines.push(`${k}: ${v}`)
      }
      upstream.write(headerLines.join('\r\n') + '\r\n\r\n')
      if (head && head.length > 0) upstream.write(head)
    })

    upstream.on('data', (chunk) => {
      if (backendReady) {
        // WebSocket frames from backend → client
        socket.write(chunk)
        return
      }
      // Buffer until we find the end of the backend's 101 response
      backendBuf = Buffer.concat([backendBuf, chunk])
      const end = backendBuf.indexOf('\r\n\r\n')
      if (end !== -1) {
        backendReady = true
        const leftover = backendBuf.slice(end + 4)
        if (leftover.length) socket.write(leftover)
        // Wire up client → backend frame forwarding and resume
        socket.on('data', (d) => upstream.write(d))
        socket.resume()
        console.log('[ws-proxy] tunnel ready')
      }
    })

    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    upstream.on('close', () => socket.destroy())
    socket.on('close', () => upstream.destroy())
  }

  server.on('upgrade', graphqlUpgradeHandler)

  // When Next.js (or any other code) adds additional upgrade listeners after us,
  // wrap them so they are skipped for /graphql — we own that path exclusively.
  const ownedListeners = new WeakSet([graphqlUpgradeHandler])
  server.on('newListener', (event, listener) => {
    if (event !== 'upgrade' || ownedListeners.has(listener)) return
    setImmediate(() => {
      const idx = server.rawListeners('upgrade').indexOf(listener)
      if (idx === -1 || ownedListeners.has(listener)) return
      server.removeListener('upgrade', listener)
      const wrapper = function (req, socket, head) {
        if (!req.url.startsWith('/graphql')) listener.call(this, req, socket, head)
      }
      ownedListeners.add(wrapper)
      server.on('upgrade', wrapper)
      console.log('[ws-proxy] wrapped extra upgrade listener (skips /graphql)')
    })
  })

  return server
}

// Load the standalone Next.js server — it will call the patched createServer
import('./server.js').catch((err) => {
  console.error('[ws-proxy] failed to load server.js:', err)
  process.exit(1)
})

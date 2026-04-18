import { createServer } from 'node:http';
import next from 'next';
import { Server as IOServer } from 'socket.io';
import { createEngine } from './src/server/sessions';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new IOServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
    pingInterval: 10_000,
    pingTimeout: 20_000,
  });

  // socket.io's engine.io installs an `upgrade` listener that aborts any
  // websocket upgrade whose path doesn't match `/socket.io/`. That kills
  // Next's dev HMR socket (`/_next/webpack-hmr`). We pull io's listener
  // out, install a router in front of it, and forward to io only for
  // non-HMR paths.
  const nextUpgrade = app.getUpgradeHandler();
  const ioUpgradeListeners = httpServer.listeners('upgrade').slice();
  httpServer.removeAllListeners('upgrade');
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (
      url.pathname.startsWith('/_next/webpack-hmr') ||
      url.pathname.startsWith('/_next/turbopack-hmr')
    ) {
      nextUpgrade(req, socket, head);
      return;
    }
    for (const l of ioUpgradeListeners) {
      (l as (...a: unknown[]) => void).call(httpServer, req, socket, head);
    }
  });

  createEngine(io);

  httpServer.listen(port, () => {
    console.log(`\n  ▶ VibeSync  →  http://localhost:${port}\n`);
  });
});

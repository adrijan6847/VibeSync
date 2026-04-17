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

  createEngine(io);

  httpServer.listen(port, () => {
    console.log(`\n  ▶ VibeSync  →  http://localhost:${port}\n`);
  });
});

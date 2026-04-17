import type { Server } from 'socket.io';
import type {
  ClientState,
  CreateResponse,
  JoinResponse,
  Participant,
  Phase,
  TickPayload,
} from '../lib/types';

type Session = {
  code: string;
  hostId: string | null;
  phase: Phase;
  energy: number;
  participants: Map<string, Participant>;
  dropCount: number;
  dropAt: number | null;
  dropId: string | null;
  lastTick: number;
  phaseEndsAt: number | null;
  beatCounter: number;
  createdAt: number;
};

const sessions = new Map<string, Session>();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(): string {
  let c = '';
  for (let i = 0; i < 4; i++) {
    c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return sessions.has(c) ? makeCode() : c;
}

function randomHue(): number {
  // Cool-only palette: ice blue through steel. No purple, no warm tones.
  // Participants are differentiated by lightness/saturation implied at render,
  // but the hue stays within a restrained cold-bloom band.
  const pools = [
    [198, 214], // ice blue
    [210, 224], // cold cobalt
    [186, 202], // cyan-steel
  ];
  const [a, b] = pools[Math.floor(Math.random() * pools.length)];
  return Math.floor(a + Math.random() * (b - a));
}

function makeSession(hostId: string): Session {
  const s: Session = {
    code: makeCode(),
    hostId,
    phase: 'lobby',
    energy: 0,
    participants: new Map(),
    dropCount: 0,
    dropAt: null,
    dropId: null,
    lastTick: Date.now(),
    phaseEndsAt: null,
    beatCounter: 0,
    createdAt: Date.now(),
  };
  sessions.set(s.code, s);
  return s;
}

function toClientState(s: Session): ClientState {
  return {
    code: s.code,
    hostId: s.hostId ?? '',
    phase: s.phase,
    energy: s.energy,
    participants: Array.from(s.participants.values()).sort(
      (a, b) => a.joinedAt - b.joinedAt,
    ),
    dropCount: s.dropCount,
    dropAt: s.dropAt ?? undefined,
    dropId: s.dropId ?? undefined,
    serverNow: Date.now(),
  };
}

const TICK_MS = 50;
const DROP_LEAD_MS = 1200;
const DROP_DURATION_MS = 2600;
const AFTERGLOW_MS = 4200;

export function createEngine(io: Server): void {
  setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values()) {
      if (s.participants.size === 0) {
        // Garbage collect empty sessions older than 60s
        if (now - s.createdAt > 60_000) sessions.delete(s.code);
        continue;
      }
      const dt = (now - s.lastTick) / 1000;
      s.lastTick = now;

      if (s.phase === 'building' || s.phase === 'peak') {
        // Trigger drop before decay — sustained saturation at 100 from taps
        // must cross the threshold, not race the decay on every tick.
        if (s.energy >= 100 && !s.dropAt) {
          s.dropId = Math.random().toString(36).slice(2, 10);
          s.dropAt = now + DROP_LEAD_MS;
          io.to(s.code).emit('drop', {
            dropAt: s.dropAt,
            dropId: s.dropId,
            serverNow: now,
          });
        }
        s.energy = Math.max(0, s.energy - 11 * dt);
        if (s.energy >= 88 && s.phase === 'building') s.phase = 'peak';
        else if (s.energy < 80 && s.phase === 'peak') s.phase = 'building';
        if (s.dropAt && now >= s.dropAt) {
          s.phase = 'drop';
          s.phaseEndsAt = now + DROP_DURATION_MS;
        }
      } else if (s.phase === 'drop') {
        s.energy = 100;
        if (s.phaseEndsAt && now >= s.phaseEndsAt) {
          s.phase = 'afterglow';
          s.phaseEndsAt = now + AFTERGLOW_MS;
        }
      } else if (s.phase === 'afterglow') {
        s.energy = Math.max(22, s.energy - 18 * dt);
        if (s.phaseEndsAt && now >= s.phaseEndsAt) {
          s.phase = 'building';
          s.phaseEndsAt = null;
          s.dropAt = null;
          s.dropId = null;
          s.dropCount++;
          s.energy = 22;
        }
      }

      s.beatCounter += TICK_MS;
      const beatInterval = s.phase === 'drop' ? 230 : s.phase === 'peak' ? 375 : 468;
      let beat = false;
      if (s.beatCounter >= beatInterval) {
        beat = true;
        s.beatCounter = 0;
      }

      const tick: TickPayload = {
        energy: s.energy,
        phase: s.phase,
        beat,
        serverNow: now,
      };
      io.to(s.code).emit('tick', tick);
    }
  }, TICK_MS);

  io.on('connection', (socket) => {
    let joinedCode: string | null = null;

    socket.on('clock:sync', (t0: number, cb: (r: { t0: number; tServer: number }) => void) => {
      cb({ t0, tServer: Date.now() });
    });

    socket.on('session:create', (_payload: unknown, cb: (r: CreateResponse) => void) => {
      const s = makeSession(socket.id);
      const p: Participant = {
        id: socket.id,
        hue: randomHue(),
        taps: 0,
        joinedAt: Date.now(),
      };
      s.participants.set(socket.id, p);
      socket.join(s.code);
      joinedCode = s.code;
      cb({ code: s.code, you: p, state: toClientState(s) });
      io.to(s.code).emit('state', toClientState(s));
    });

    socket.on(
      'session:join',
      ({ code }: { code: string }, cb: (r: JoinResponse) => void) => {
        const key = (code || '').toUpperCase().trim();
        const s = sessions.get(key);
        if (!s) {
          cb({ ok: false, error: 'Session not found' });
          return;
        }
        const p: Participant = {
          id: socket.id,
          hue: randomHue(),
          taps: 0,
          joinedAt: Date.now(),
        };
        s.participants.set(socket.id, p);
        if (!s.hostId) s.hostId = socket.id;
        socket.join(s.code);
        joinedCode = s.code;
        cb({ ok: true, state: toClientState(s), you: p });
        io.to(s.code).emit('state', toClientState(s));
      },
    );

    socket.on('session:tap', () => {
      if (!joinedCode) return;
      const s = sessions.get(joinedCode);
      if (!s) return;
      const p = s.participants.get(socket.id);
      if (!p) return;
      p.taps++;
      if (s.phase === 'building' || s.phase === 'peak') {
        s.energy = Math.min(100, s.energy + 3.1);
      } else if (s.phase === 'afterglow') {
        s.energy = Math.min(75, s.energy + 1.2);
      }
    });

    socket.on('session:start', () => {
      if (!joinedCode) return;
      const s = sessions.get(joinedCode);
      if (!s || s.hostId !== socket.id) return;
      if (s.phase !== 'lobby') return;
      s.phase = 'building';
      s.energy = 18;
      s.lastTick = Date.now();
      io.to(s.code).emit('state', toClientState(s));
    });

    socket.on('session:reset', () => {
      if (!joinedCode) return;
      const s = sessions.get(joinedCode);
      if (!s || s.hostId !== socket.id) return;
      s.phase = 'lobby';
      s.energy = 0;
      s.dropAt = null;
      s.dropId = null;
      s.phaseEndsAt = null;
      io.to(s.code).emit('state', toClientState(s));
    });

    socket.on('disconnect', () => {
      if (!joinedCode) return;
      const s = sessions.get(joinedCode);
      if (!s) return;
      s.participants.delete(socket.id);
      if (s.hostId === socket.id) {
        const next = s.participants.values().next().value;
        s.hostId = next ? next.id : null;
      }
      if (s.participants.size === 0) {
        // leave around briefly in case host reconnects
        s.hostId = null;
      } else {
        io.to(s.code).emit('state', toClientState(s));
      }
    });
  });
}

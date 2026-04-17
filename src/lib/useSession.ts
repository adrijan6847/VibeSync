'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from './socket';
import type {
  ClientState,
  CreateResponse,
  DropPayload,
  JoinResponse,
  Participant,
  Phase,
  TickPayload,
} from './types';

export type SessionSnapshot = {
  connected: boolean;
  state: ClientState | null;
  you: Participant | null;
  isHost: boolean;
  energy: number;
  phase: Phase;
  beatId: number;
  drop: DropPayload | null;
  clockOffset: number; // serverNow - clientNow
};

export type SessionActions = {
  create: () => Promise<CreateResponse>;
  join: (code: string) => Promise<JoinResponse>;
  tap: () => void;
  start: () => void;
  reset: () => void;
};

export function useSession(): SessionSnapshot & SessionActions {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<ClientState | null>(null);
  const [you, setYou] = useState<Participant | null>(null);
  const [energy, setEnergy] = useState(0);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [beatId, setBeatId] = useState(0);
  const [drop, setDrop] = useState<DropPayload | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const youRef = useRef<Participant | null>(null);
  youRef.current = you;

  useEffect(() => {
    const s = getSocket();

    const onConnect = () => {
      setConnected(true);
      // Clock sync
      const t0 = Date.now();
      s.emit('clock:sync', t0, (r: { t0: number; tServer: number }) => {
        const t1 = Date.now();
        const rtt = t1 - r.t0;
        const offset = r.tServer - (r.t0 + rtt / 2);
        setClockOffset(offset);
      });
    };
    const onDisconnect = () => setConnected(false);

    const onState = (snap: ClientState) => {
      setState(snap);
      setPhase(snap.phase);
      setEnergy(snap.energy);
      if (snap.dropAt && snap.dropId) {
        setDrop({ dropAt: snap.dropAt, dropId: snap.dropId, serverNow: snap.serverNow });
      } else {
        setDrop(null);
      }
    };
    const onTick = (t: TickPayload) => {
      setEnergy(t.energy);
      setPhase(t.phase);
      if (t.beat) setBeatId((n) => n + 1);
    };
    const onDrop = (d: DropPayload) => {
      setDrop(d);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('state', onState);
    s.on('tick', onTick);
    s.on('drop', onDrop);
    if (s.connected) onConnect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('state', onState);
      s.off('tick', onTick);
      s.off('drop', onDrop);
    };
  }, []);

  const create = useCallback(async (): Promise<CreateResponse> => {
    const s = getSocket();
    return new Promise((resolve) => {
      s.emit('session:create', {}, (r: CreateResponse) => {
        setYou(r.you);
        setState(r.state);
        setPhase(r.state.phase);
        setEnergy(r.state.energy);
        resolve(r);
      });
    });
  }, []);

  const join = useCallback(async (code: string): Promise<JoinResponse> => {
    const s = getSocket();
    return new Promise((resolve) => {
      s.emit('session:join', { code: code.toUpperCase().trim() }, (r: JoinResponse) => {
        if (r.ok) {
          setYou(r.you);
          setState(r.state);
          setPhase(r.state.phase);
          setEnergy(r.state.energy);
        }
        resolve(r);
      });
    });
  }, []);

  const tap = useCallback(() => {
    getSocket().emit('session:tap');
  }, []);

  const start = useCallback(() => {
    getSocket().emit('session:start');
  }, []);

  const reset = useCallback(() => {
    getSocket().emit('session:reset');
  }, []);

  const isHost = !!(state && you && state.hostId === you.id);

  return {
    connected,
    state,
    you,
    isHost,
    energy,
    phase,
    beatId,
    drop,
    clockOffset,
    create,
    join,
    tap,
    start,
    reset,
  };
}

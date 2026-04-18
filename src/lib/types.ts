import type { ProviderId } from '@/music/types';

export type Phase = 'lobby' | 'building' | 'peak' | 'drop' | 'afterglow';

export type Participant = {
  id: string;
  hue: number;
  taps: number;
  joinedAt: number;
  /** Streaming service the participant plays through. null until picked. */
  provider: ProviderId | null;
};

export type ClientState = {
  code: string;
  hostId: string;
  phase: Phase;
  energy: number;
  participants: Participant[];
  dropCount: number;
  dropAt?: number;
  dropId?: string;
  serverNow: number;
};

export type TickPayload = {
  energy: number;
  phase: Phase;
  beat: boolean;
  serverNow: number;
};

export type DropPayload = {
  dropAt: number;
  dropId: string;
  serverNow: number;
};

export type CreateResponse = {
  code: string;
  you: Participant;
  state: ClientState;
};

export type JoinResponse =
  | { ok: true; state: ClientState; you: Participant }
  | { ok: false; error: string };

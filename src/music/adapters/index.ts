/**
 * Adapter registry. Each provider adapter registers itself via
 * registerAdapter() at module load time; consumers call getAdapter(id)
 * to obtain an instance without importing a specific provider file.
 *
 * Kept as a runtime registry (not a static import) so that provider
 * SDKs (Spotify, MusicKit) are only loaded when a user actually picks
 * that service.
 */

import type { ProviderId } from '../types';
import type { MusicProvider } from './MusicProvider';

type Factory = () => MusicProvider;

const registry = new Map<ProviderId, Factory>();

export function registerAdapter(id: ProviderId, factory: Factory): void {
  registry.set(id, factory);
}

export function hasAdapter(id: ProviderId): boolean {
  return registry.has(id);
}

export function getAdapter(id: ProviderId): MusicProvider {
  const factory = registry.get(id);
  if (!factory) {
    throw new Error(
      `No adapter registered for provider "${id}". ` +
        `Ensure the adapter module has been imported before calling getAdapter.`,
    );
  }
  return factory();
}

export function listProviders(): ProviderId[] {
  return Array.from(registry.keys());
}

/**
 * Provider display name lookup. Instantiates the adapter factory once
 * to read its displayName — cheap, since adapter constructors only
 * allocate state and defer SDK loading until authenticate().
 *
 * Callers outside src/music/adapters/* use this instead of naming
 * services directly.
 */
export function providerDisplayName(id: ProviderId): string {
  if (!hasAdapter(id)) return id;
  return getAdapter(id).displayName;
}

/**
 * Pending-provider handoff, used when an auth flow must redirect the
 * browser away (OAuth) and return later. Adapters stash the chosen
 * provider id here before redirecting; the generic session UI reads
 * it on mount to auto-resume the selection.
 *
 * Kept in sessionStorage so it's per-tab and cleared on browser exit.
 * The value is a ProviderId — generic, so no service name leaks into
 * consumers outside src/music/adapters/*.
 */
const PENDING_PROVIDER_STORAGE_KEY = 'vs.pending_provider';

export function setPendingProvider(id: ProviderId): void {
  try {
    sessionStorage.setItem(PENDING_PROVIDER_STORAGE_KEY, id);
  } catch {
    // ignore — sessionStorage disabled in some private-mode browsers
  }
}

export function readAndClearPendingProvider(): ProviderId | null {
  try {
    const v = sessionStorage.getItem(PENDING_PROVIDER_STORAGE_KEY);
    if (!v) return null;
    sessionStorage.removeItem(PENDING_PROVIDER_STORAGE_KEY);
    if (!hasAdapter(v as ProviderId)) return null;
    return v as ProviderId;
  } catch {
    return null;
  }
}

/**
 * Connect-UI registry. Each adapter that needs a custom auth UI
 * (paste a token, click "Sign in with Apple", etc.) registers a React
 * component here, keyed by ProviderId.
 *
 * This keeps provider-specific UI code inside src/music/adapters/*,
 * preserving the rule that nothing outside that folder names a
 * specific service.
 *
 * Consumers (the generic MusicPanel) pick the component with
 * getConnectUI(id) and render it when the user selects a provider
 * that hasn't authenticated yet.
 */

import type { ComponentType } from 'react';
import type { ProviderId } from '../types';

export type ConnectUIProps = {
  /** Called after the adapter reports isAuthenticated(). */
  onAuthenticated: () => void;
  /** Called if the user wants to go back to provider selection. */
  onCancel?: () => void;
};

const registry = new Map<ProviderId, ComponentType<ConnectUIProps>>();

export function registerConnectUI(
  id: ProviderId,
  component: ComponentType<ConnectUIProps>,
): void {
  registry.set(id, component);
}

export function getConnectUI(
  id: ProviderId,
): ComponentType<ConnectUIProps> | null {
  return registry.get(id) ?? null;
}

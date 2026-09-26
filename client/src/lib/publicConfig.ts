import { api } from './api';

export interface PublicConfig { googleMapsKey: string | null; cartoKey: string | null; demoMode: boolean }

let pending: Promise<PublicConfig> | null = null;

/** Browser-safe configuration from the server (fetched once per page load). Keys never live in client source. */
export function getPublicConfig(): Promise<PublicConfig> {
  pending ??= api<PublicConfig>('/config/public').catch(() => ({ googleMapsKey: null, cartoKey: null, demoMode: true }));
  return pending;
}

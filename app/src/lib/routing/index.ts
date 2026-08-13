/**
 * The provider registry and the ROUTING_PROVIDER switch.
 *
 * Three backends draw the line; one scorer reads it. Which one runs is a
 * server-side environment variable, not a user setting — the three are not
 * equivalent (see each provider's own header), and picking between them is a
 * deployment decision about what this instance is demonstrating.
 */

import { brouterProvider } from "./brouter";
import { graphProvider } from "./graph";
import { orsProvider } from "./ors";
import type { ProviderId, RouteProvider } from "./types";

export const PROVIDERS: Record<ProviderId, RouteProvider> = {
  graph: graphProvider,
  ors: orsProvider,
  brouter: brouterProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && v in PROVIDERS;
}

/**
 * `graph` is the default because it is the only one that needs no third-party
 * service to be reachable and no API key to be set — a fresh clone routes. It
 * is also the one this project is actually arguing for.
 */
export const DEFAULT_PROVIDER: ProviderId = "graph";

/**
 * Resolved per call rather than at module load, so a test can set the variable
 * without having to defeat module caching.
 */
export function activeProvider(): RouteProvider {
  const configured = process.env.ROUTING_PROVIDER;
  if (isProviderId(configured)) return PROVIDERS[configured];
  return PROVIDERS[DEFAULT_PROVIDER];
}

export { graphProvider, orsProvider, brouterProvider };
export * from "./types";

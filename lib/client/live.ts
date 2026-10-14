import type { API } from "@/shared/contract";

export type ApiKey = keyof typeof API;

/**
 * API keys (names in `API` from the contract) whose backend endpoints are LIVE.
 * Flip an endpoint on by adding its key here once .coord/api-status.md says LIVE.
 * Example: new Set<ApiKey>(["dashboard", "rulebooks", "rulebook", "compileStream"])
 */
export const LIVE = new Set<string>([]);

/** True when the endpoint should hit the real backend. NEXT_PUBLIC_USE_MOCKS=1 forces mocks everywhere. */
export function isLive(key: ApiKey): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === "1") return false;
  return LIVE.has(key);
}

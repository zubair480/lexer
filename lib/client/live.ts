import type { API } from "@/shared/contract";

export type ApiKey = keyof typeof API;

/**
 * Every backend endpoint is LIVE (see .coord/api-status.md), so the client talks to the
 * real API by default. Set NEXT_PUBLIC_USE_MOCKS=1 to run the UI on in-memory mocks instead.
 */
export function isLive(_key: ApiKey): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCKS !== "1";
}

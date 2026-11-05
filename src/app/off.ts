import { offClient, offIdentification, type OffClient } from '../scan/openFoodFacts';

/**
 * The one Open Food Facts client of the app, so its rate limit is shared by every screen. Created
 * on first use. Tests replace it with `setOffClient`.
 */
let client: OffClient | undefined;

export function getOff(): OffClient {
  client ??= offClient({ userAgent: offIdentification(__BUILD_VERSION__) });
  return client;
}

export function setOffClient(next: OffClient | undefined): void {
  client = next;
}

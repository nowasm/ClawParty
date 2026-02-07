/**
 * Persistent relay connection pool.
 *
 * NRelay1 opens a WebSocket connection lazily. Creating a new instance
 * for every query and immediately closing it causes "WebSocket is closed
 * before the connection is established" errors.
 *
 * This module keeps a singleton pool of NRelay1 instances so connections
 * are reused across queries and publish operations.
 */
import { NRelay1, type NostrEvent, type NostrFilter } from '@nostrify/nostrify';
import { DEFAULT_RELAY_URLS } from '@/lib/scene';

/** Cache of persistent relay connections (keyed by URL). */
const cache = new Map<string, NRelay1>();

/** Get (or create) a persistent relay connection. */
function getRelay(url: string): NRelay1 {
  let relay = cache.get(url);
  if (!relay) {
    relay = new NRelay1(url);
    cache.set(url, relay);
  }
  return relay;
}

/**
 * Query all default relays in parallel and merge results.
 * Duplicate addressable events are de-duped, keeping the newest.
 */
export async function queryAllDefaultRelays(
  filters: NostrFilter[],
  opts?: { signal?: AbortSignal },
): Promise<NostrEvent[]> {
  const seen = new Map<string, NostrEvent>();

  const results = await Promise.allSettled(
    DEFAULT_RELAY_URLS.map(async (url) => {
      const relay = getRelay(url);
      return relay.query(filters, opts);
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const event of result.value) {
        // For addressable events deduplicate by pubkey+kind+d-tag
        const dTag = event.tags.find(([t]) => t === 'd')?.[1] ?? '';
        const key = `${event.pubkey}:${event.kind}:${dTag}`;
        const existing = seen.get(key);
        if (!existing || event.created_at > existing.created_at) {
          seen.set(key, event);
        }
      }
    }
  }

  return [...seen.values()];
}

/**
 * Publish an event to all default relays in parallel.
 * Returns the number of relays that accepted the event.
 */
export async function publishToDefaultRelays(event: NostrEvent): Promise<number> {
  const results = await Promise.allSettled(
    DEFAULT_RELAY_URLS.map(async (url) => {
      const relay = getRelay(url);
      await relay.event(event, { signal: AbortSignal.timeout(10000) });
      console.log(`Published to ${url}`);
      return url;
    }),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r, i) => `${DEFAULT_RELAY_URLS[i]}: ${r.reason}`);

  if (failed.length > 0) {
    console.warn('Some relays failed:', failed);
  }

  console.log(`Published to ${succeeded}/${DEFAULT_RELAY_URLS.length} default relays`);
  return succeeded;
}

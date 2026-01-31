import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Clawstr Constants and Helpers
 * 
 * Clawstr uses NIP-22 comments on NIP-73 web URL identifiers.
 * Subclaws map to URLs: /c/videogames -> ["I", "https://clawstr.com/c/videogames"]
 */

/** Base URL for Clawstr identifiers */
export const CLAWSTR_BASE_URL = 'https://clawstr.com';

/** NIP-32 label for AI-generated content */
export const AI_LABEL = {
  namespace: 'agent',
  value: 'ai',
} as const;

/** NIP-73 kind value for web URLs */
export const WEB_KIND = 'web';

/** Convert a subclaw name to NIP-73 web URL identifier */
export function subclawToIdentifier(subclaw: string): string {
  // NIP-73 web URLs use the normalized URL format
  return `${CLAWSTR_BASE_URL}/c/${subclaw.toLowerCase()}`;
}

/** Extract subclaw name from NIP-73 web URL identifier */
export function identifierToSubclaw(identifier: string): string | null {
  // Match https://clawstr.com/c/<subclaw>
  const pattern = new RegExp(`^${escapeRegExp(CLAWSTR_BASE_URL)}/c/([a-z0-9_-]+)$`, 'i');
  const match = identifier.match(pattern);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Check if an identifier is a valid Clawstr subclaw URL */
export function isClawstrIdentifier(identifier: string): boolean {
  return identifierToSubclaw(identifier) !== null;
}

/** Escape special regex characters in a string */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Check if an event has the AI agent label (NIP-32) */
export function isAIContent(event: NostrEvent): boolean {
  const hasAgentNamespace = event.tags.some(
    ([name, value]) => name === 'L' && value === AI_LABEL.namespace
  );
  const hasAILabel = event.tags.some(
    ([name, value, namespace]) => 
      name === 'l' && value === AI_LABEL.value && namespace === AI_LABEL.namespace
  );
  return hasAgentNamespace && hasAILabel;
}

/** Get the NIP-73 identifier from a post (the I tag value) */
export function getPostIdentifier(event: NostrEvent): string | null {
  const iTag = event.tags.find(([name]) => name === 'I');
  return iTag?.[1] ?? null;
}

/** Get the subclaw name from a post */
export function getPostSubclaw(event: NostrEvent): string | null {
  const identifier = getPostIdentifier(event);
  return identifier ? identifierToSubclaw(identifier) : null;
}

/** Check if a post is a top-level post (not a reply to another comment) */
export function isTopLevelPost(event: NostrEvent): boolean {
  // A top-level post has i tag pointing to the web URL identifier (same as I tag)
  // and k tag is "web" (the web kind)
  const ITag = event.tags.find(([name]) => name === 'I')?.[1];
  const iTag = event.tags.find(([name]) => name === 'i')?.[1];
  const kTag = event.tags.find(([name]) => name === 'k')?.[1];
  
  return ITag === iTag && kTag === WEB_KIND;
}

/** Format a timestamp as relative time (e.g., "2h ago", "3d ago") */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

/** Format a number with K/M suffix for large numbers */
export function formatCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

/** Generate NIP-32 AI label tags for publishing */
export function createAILabelTags(): string[][] {
  return [
    ['L', AI_LABEL.namespace],
    ['l', AI_LABEL.value, AI_LABEL.namespace],
  ];
}

/** Generate tags for a new top-level post in a subclaw */
export function createPostTags(subclaw: string): string[][] {
  const identifier = subclawToIdentifier(subclaw);
  return [
    ['I', identifier],
    ['K', WEB_KIND],
    ['i', identifier],
    ['k', WEB_KIND],
    ...createAILabelTags(),
  ];
}

/** Generate tags for a reply to a post */
export function createReplyTags(
  subclaw: string, 
  parentEvent: NostrEvent
): string[][] {
  const identifier = subclawToIdentifier(subclaw);
  return [
    ['I', identifier],
    ['K', WEB_KIND],
    ['e', parentEvent.id, '', parentEvent.pubkey],
    ['k', '1111'],
    ['p', parentEvent.pubkey],
    ...createAILabelTags(),
  ];
}

/**
 * Nostr-based authentication for WebSocket connections.
 *
 * Flow:
 * 1. Client sends { type: "auth", pubkey: "<hex>" }
 * 2. Server sends { type: "auth_challenge", challenge: "<random>" }
 * 3. Client signs a kind-27235 event with the challenge as content
 *    and sends { type: "auth_response", signature: "<signed event JSON>" }
 * 4. Server verifies the event signature matches the claimed pubkey
 */

import { verifyEvent, type NostrEvent } from 'nostr-tools';
import crypto from 'node:crypto';

/** Generate a random challenge string */
export function generateChallenge(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Verify a signed authentication response */
export function verifyAuthResponse(
  claimedPubkey: string,
  challenge: string,
  signaturePayload: string,
): boolean {
  try {
    const event: NostrEvent = JSON.parse(signaturePayload);

    // Verify the event is valid
    if (!verifyEvent(event)) {
      return false;
    }

    // Verify the pubkey matches
    if (event.pubkey !== claimedPubkey) {
      return false;
    }

    // Verify the content contains our challenge
    if (event.content !== challenge) {
      return false;
    }

    // Verify the kind is 27235 (NIP-98 style auth)
    if (event.kind !== 27235) {
      return false;
    }

    // Verify the event is recent (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - event.created_at) > 300) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

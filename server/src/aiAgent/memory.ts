/**
 * AI Agent Memory System
 *
 * Provides short-term and long-term memory for AI agents.
 *
 * Short-term: In-memory buffer of recent events during the current session.
 * Long-term:  Persistent storage of important interactions (file-based for
 *             now, can be upgraded to Nostr events in the future).
 * Relationships: Tracks familiarity with other players.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface MemoryEntry {
  /** When this memory was created (epoch ms) */
  timestamp: number;
  /** The type of memory */
  type: 'interaction' | 'observation' | 'conversation' | 'relationship';
  /** Who was involved (pubkeys) */
  participants: string[];
  /** Brief summary of what happened */
  summary: string;
  /** Importance score (0-1) — higher = more likely to be retained */
  importance: number;
}

export interface RelationshipData {
  pubkey: string;
  /** Display name (last known) */
  displayName?: string;
  /** Number of interactions */
  interactionCount: number;
  /** Last interaction timestamp */
  lastInteraction: number;
  /** Familiarity level (0-1) */
  familiarity: number;
  /** Short notes about this person */
  notes: string[];
}

export interface MemoryState {
  agentPubkey: string;
  shortTerm: MemoryEntry[];
  longTerm: MemoryEntry[];
  relationships: Record<string, RelationshipData>;
  sessionStart: number;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_SHORT_TERM = 100;
const MAX_LONG_TERM = 500;
const MAX_RELATIONSHIP_NOTES = 5;

// ============================================================================
// Memory
// ============================================================================

export class Memory {
  private state: MemoryState;
  private storagePath: string | null;

  constructor(agentPubkey: string, storagePath?: string) {
    this.storagePath = storagePath ?? null;
    this.state = {
      agentPubkey,
      shortTerm: [],
      longTerm: [],
      relationships: {},
      sessionStart: Date.now(),
    };
  }

  // --------------------------------------------------------------------------
  // Short-term memory (current session)
  // --------------------------------------------------------------------------

  /** Add a short-term memory entry */
  remember(entry: Omit<MemoryEntry, 'timestamp'>): void {
    const full: MemoryEntry = { ...entry, timestamp: Date.now() };
    this.state.shortTerm.push(full);
    if (this.state.shortTerm.length > MAX_SHORT_TERM) {
      // Promote important entries to long-term before eviction
      const evicted = this.state.shortTerm.shift()!;
      if (evicted.importance > 0.5) {
        this.addLongTerm(evicted);
      }
    }
  }

  /** Record a conversation exchange */
  rememberConversation(pubkey: string, theirMessage: string, myResponse: string): void {
    this.remember({
      type: 'conversation',
      participants: [pubkey],
      summary: `They said: "${theirMessage.slice(0, 100)}". I replied: "${myResponse.slice(0, 100)}"`,
      importance: 0.6,
    });
    this.updateRelationship(pubkey, 'conversation');
  }

  /** Record an observation (someone joined, did something, etc.) */
  rememberObservation(summary: string, participants: string[] = [], importance = 0.3): void {
    this.remember({
      type: 'observation',
      participants,
      summary,
      importance,
    });
  }

  /** Get recent short-term memories (most recent first) */
  getRecentMemories(count = 10): MemoryEntry[] {
    return this.state.shortTerm.slice(-count).reverse();
  }

  // --------------------------------------------------------------------------
  // Relationships
  // --------------------------------------------------------------------------

  /** Update relationship data after an interaction */
  updateRelationship(pubkey: string, interactionType: string, displayName?: string): void {
    const existing = this.state.relationships[pubkey];
    if (existing) {
      existing.interactionCount++;
      existing.lastInteraction = Date.now();
      existing.familiarity = Math.min(1, existing.familiarity + 0.05);
      if (displayName) existing.displayName = displayName;
    } else {
      this.state.relationships[pubkey] = {
        pubkey,
        displayName,
        interactionCount: 1,
        lastInteraction: Date.now(),
        familiarity: 0.1,
        notes: [],
      };
    }
  }

  /** Add a note about a player */
  addRelationshipNote(pubkey: string, note: string): void {
    const rel = this.state.relationships[pubkey];
    if (rel) {
      rel.notes.push(note);
      if (rel.notes.length > MAX_RELATIONSHIP_NOTES) {
        rel.notes.shift();
      }
    }
  }

  /** Get relationship data for a player */
  getRelationship(pubkey: string): RelationshipData | undefined {
    return this.state.relationships[pubkey];
  }

  /** Get all known relationships sorted by familiarity */
  getAllRelationships(): RelationshipData[] {
    return Object.values(this.state.relationships)
      .sort((a, b) => b.familiarity - a.familiarity);
  }

  // --------------------------------------------------------------------------
  // Long-term memory
  // --------------------------------------------------------------------------

  private addLongTerm(entry: MemoryEntry): void {
    this.state.longTerm.push(entry);
    if (this.state.longTerm.length > MAX_LONG_TERM) {
      // Remove the least important entry
      let minIdx = 0;
      let minImportance = Infinity;
      for (let i = 0; i < this.state.longTerm.length; i++) {
        if (this.state.longTerm[i].importance < minImportance) {
          minImportance = this.state.longTerm[i].importance;
          minIdx = i;
        }
      }
      this.state.longTerm.splice(minIdx, 1);
    }
  }

  /** Search long-term memories by keyword */
  searchLongTerm(keyword: string, maxResults = 5): MemoryEntry[] {
    const lower = keyword.toLowerCase();
    return this.state.longTerm
      .filter((e) => e.summary.toLowerCase().includes(lower))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, maxResults);
  }

  // --------------------------------------------------------------------------
  // Context generation for LLM
  // --------------------------------------------------------------------------

  /** Generate a memory context string for the LLM */
  generateContext(pubkey?: string): string {
    const parts: string[] = [];

    // Recent memories
    const recent = this.getRecentMemories(5);
    if (recent.length > 0) {
      parts.push('Recent events:');
      for (const mem of recent) {
        parts.push(`  - ${mem.summary}`);
      }
    }

    // Relationship context for a specific player
    if (pubkey) {
      const rel = this.getRelationship(pubkey);
      if (rel) {
        parts.push(`\nAbout this player (${rel.displayName ?? pubkey.slice(0, 8)}):`);
        parts.push(`  Met ${rel.interactionCount} time(s), familiarity: ${(rel.familiarity * 100).toFixed(0)}%`);
        if (rel.notes.length > 0) {
          parts.push(`  Notes: ${rel.notes.join('; ')}`);
        }
      }
    }

    return parts.join('\n');
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  /** Save memory state to disk */
  async save(): Promise<void> {
    if (!this.storagePath) return;

    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      // Promote important short-term memories to long-term before saving
      for (const entry of this.state.shortTerm) {
        if (entry.importance > 0.5) {
          this.addLongTerm(entry);
        }
      }

      const saveState = {
        agentPubkey: this.state.agentPubkey,
        longTerm: this.state.longTerm,
        relationships: this.state.relationships,
      };

      await writeFile(this.storagePath, JSON.stringify(saveState, null, 2), 'utf-8');
      console.log(`[Memory] Saved to ${this.storagePath}`);
    } catch (err) {
      console.error('[Memory] Save failed:', err);
    }
  }

  /** Load memory state from disk */
  async load(): Promise<void> {
    if (!this.storagePath) return;

    try {
      if (!existsSync(this.storagePath)) return;

      const data = await readFile(this.storagePath, 'utf-8');
      const saved = JSON.parse(data) as {
        agentPubkey: string;
        longTerm: MemoryEntry[];
        relationships: Record<string, RelationshipData>;
      };

      if (saved.agentPubkey === this.state.agentPubkey) {
        this.state.longTerm = saved.longTerm ?? [];
        this.state.relationships = saved.relationships ?? {};
        console.log(`[Memory] Loaded from ${this.storagePath}: ${this.state.longTerm.length} long-term, ${Object.keys(this.state.relationships).length} relationships`);
      }
    } catch (err) {
      console.error('[Memory] Load failed:', err);
    }
  }
}

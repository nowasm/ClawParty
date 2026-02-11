/**
 * AI Agent Module
 *
 * Provides the full AI Agent framework for creating first-class AI players
 * that connect to sync servers, perceive the 3D world, make decisions
 * via LLM reasoning, and take actions (move, chat, emote).
 *
 * Usage:
 *   import { Agent } from './aiAgent/index.js';
 *
 *   const agent = new Agent({
 *     secretKey: mySecretKey,
 *     syncUrl: 'wss://my-server.com',
 *     mapId: 5050,
 *     name: 'Lobster Bob',
 *   });
 *   await agent.start();
 */

export { Agent, type AgentConfig } from './agent.js';
export { AgentConnector, type ConnectorOptions, type ConnectorState } from './connector.js';
export { Perception, type WorldSnapshot, type PerceivedPeer, type ChatEntry, type PerceptionEvent } from './perception.js';
export { DecisionEngine, type DecisionEngineConfig, type AgentAction, type BehaviorState, type LLMProvider, ShakespeareLLM } from './decisionEngine.js';
export { ActionExecutor } from './actionExecutor.js';
export { Memory, type MemoryEntry, type RelationshipData, type MemoryState } from './memory.js';

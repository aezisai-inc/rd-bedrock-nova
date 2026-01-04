/**
 * Memory Domain Module
 *
 * Clean Architecture + Event Sourcing + CQRS
 */

// Aggregates
export {
  MemorySession,
  type SessionStatus,
} from './aggregates/MemorySession';

// Value Objects
export {
  MemorySessionId,
  ActorId,
  MemoryEventData,
  type MemoryRole,
} from './aggregates/MemorySession';

// Domain Events
export {
  MemorySessionCreated,
  MemoryEventStored,
  MemorySessionClosed,
} from './aggregates/MemorySession';

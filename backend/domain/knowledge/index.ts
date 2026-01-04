/**
 * Knowledge Domain Module
 *
 * Clean Architecture + Event Sourcing + CQRS
 */

// Aggregates
export { KnowledgeSession, type SessionStatus } from './aggregates/KnowledgeSession';
export {
  KnowledgeSessionCreated,
  QueryExecuted,
  ResultsReturned,
  SessionClosed,
} from './aggregates/KnowledgeSession';

// Value Objects
export { KnowledgeSessionId } from './value-objects/KnowledgeSessionId';
export { UserId } from './value-objects/UserId';
export { Query, QueryId, type QueryFilters } from './value-objects/Query';
export { SearchResult, type SearchResultMetadata } from './value-objects/SearchResult';

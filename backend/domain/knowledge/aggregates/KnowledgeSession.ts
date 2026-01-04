/**
 * KnowledgeSession Aggregate Root
 *
 * Clean Architecture + Event Sourcing + CQRS
 * ナレッジ検索セッションを管理する集約ルート
 */

import { AggregateRoot } from '../../shared/AggregateRoot';
import { DomainEvent } from '../../shared/DomainEvent';
import { KnowledgeSessionId } from '../value-objects/KnowledgeSessionId';
import { UserId } from '../value-objects/UserId';
import { Query, QueryId } from '../value-objects/Query';
import { SearchResult } from '../value-objects/SearchResult';

// =============================================================================
// Domain Events
// =============================================================================

export class KnowledgeSessionCreated implements DomainEvent {
  readonly eventType = 'KnowledgeSessionCreated';
  readonly occurredAt: Date;

  constructor(
    public readonly sessionId: KnowledgeSessionId,
    public readonly userId: UserId
  ) {
    this.occurredAt = new Date();
  }
}

export class QueryExecuted implements DomainEvent {
  readonly eventType = 'QueryExecuted';
  readonly occurredAt: Date;

  constructor(
    public readonly sessionId: KnowledgeSessionId,
    public readonly query: Query
  ) {
    this.occurredAt = new Date();
  }
}

export class ResultsReturned implements DomainEvent {
  readonly eventType = 'ResultsReturned';
  readonly occurredAt: Date;

  constructor(
    public readonly sessionId: KnowledgeSessionId,
    public readonly queryId: QueryId,
    public readonly results: SearchResult[],
    public readonly totalCount: number
  ) {
    this.occurredAt = new Date();
  }
}

export class SessionClosed implements DomainEvent {
  readonly eventType = 'SessionClosed';
  readonly occurredAt: Date;

  constructor(public readonly sessionId: KnowledgeSessionId) {
    this.occurredAt = new Date();
  }
}

// =============================================================================
// Aggregate Root
// =============================================================================

export type SessionStatus = 'active' | 'closed';

export class KnowledgeSession extends AggregateRoot {
  private _id: KnowledgeSessionId;
  private _userId: UserId;
  private _queries: Query[] = [];
  private _status: SessionStatus = 'active';
  private _createdAt: Date;

  private constructor() {
    super();
    this._createdAt = new Date();
  }

  // =============================================================================
  // Factory Methods
  // =============================================================================

  static create(userId: UserId): KnowledgeSession {
    const session = new KnowledgeSession();
    const sessionId = KnowledgeSessionId.generate();

    session.apply(new KnowledgeSessionCreated(sessionId, userId));

    return session;
  }

  static reconstitute(events: DomainEvent[]): KnowledgeSession {
    const session = new KnowledgeSession();
    events.forEach((event) => session.applyEvent(event));
    return session;
  }

  // =============================================================================
  // Commands
  // =============================================================================

  executeQuery(queryText: string, filters?: Record<string, unknown>): Query {
    this.ensureActive();

    const query = Query.create(queryText, filters);
    this.apply(new QueryExecuted(this._id, query));

    return query;
  }

  recordResults(queryId: QueryId, results: SearchResult[]): void {
    this.ensureActive();

    const query = this._queries.find((q) => q.id.equals(queryId));
    if (!query) {
      throw new Error(`Query ${queryId.value} not found in session`);
    }

    this.apply(new ResultsReturned(this._id, queryId, results, results.length));
  }

  close(): void {
    if (this._status === 'closed') {
      throw new Error('Session is already closed');
    }

    this.apply(new SessionClosed(this._id));
  }

  // =============================================================================
  // Event Handlers (Event Sourcing)
  // =============================================================================

  protected applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case 'KnowledgeSessionCreated':
        this.onSessionCreated(event as KnowledgeSessionCreated);
        break;
      case 'QueryExecuted':
        this.onQueryExecuted(event as QueryExecuted);
        break;
      case 'ResultsReturned':
        this.onResultsReturned(event as ResultsReturned);
        break;
      case 'SessionClosed':
        this.onSessionClosed(event as SessionClosed);
        break;
    }
  }

  private onSessionCreated(event: KnowledgeSessionCreated): void {
    this._id = event.sessionId;
    this._userId = event.userId;
    this._createdAt = event.occurredAt;
    this._status = 'active';
  }

  private onQueryExecuted(event: QueryExecuted): void {
    this._queries.push(event.query);
  }

  private onResultsReturned(event: ResultsReturned): void {
    const query = this._queries.find((q) => q.id.equals(event.queryId));
    if (query) {
      query.setResults(event.results);
    }
  }

  private onSessionClosed(_event: SessionClosed): void {
    this._status = 'closed';
  }

  // =============================================================================
  // Invariant Checks
  // =============================================================================

  private ensureActive(): void {
    if (this._status !== 'active') {
      throw new Error('Cannot perform operation on closed session');
    }
  }

  // =============================================================================
  // Getters
  // =============================================================================

  get id(): KnowledgeSessionId {
    return this._id;
  }

  get userId(): UserId {
    return this._userId;
  }

  get queries(): ReadonlyArray<Query> {
    return [...this._queries];
  }

  get status(): SessionStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get queryCount(): number {
    return this._queries.length;
  }
}

/**
 * Query Value Object
 */

import { v4 as uuidv4 } from 'uuid';
import { SearchResult } from './SearchResult';

export class QueryId {
  private constructor(public readonly value: string) {
    if (!value || value.trim() === '') {
      throw new Error('QueryId cannot be empty');
    }
  }

  static generate(): QueryId {
    return new QueryId(`q-${uuidv4()}`);
  }

  static fromString(value: string): QueryId {
    return new QueryId(value);
  }

  equals(other: QueryId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export interface QueryFilters {
  sourceType?: 'pdf' | 'text' | 'html' | 'all';
  dateRange?: {
    from?: string;
    to?: string;
  };
  metadata?: Record<string, string>;
}

export class Query {
  private _results: SearchResult[] = [];

  private constructor(
    public readonly id: QueryId,
    public readonly text: string,
    public readonly filters: QueryFilters | undefined,
    public readonly executedAt: Date
  ) {
    if (!text || text.trim() === '') {
      throw new Error('Query text cannot be empty');
    }
  }

  static create(text: string, filters?: Record<string, unknown>): Query {
    const queryFilters = filters as QueryFilters | undefined;
    return new Query(QueryId.generate(), text, queryFilters, new Date());
  }

  setResults(results: SearchResult[]): void {
    this._results = [...results];
  }

  get results(): ReadonlyArray<SearchResult> {
    return [...this._results];
  }

  get hasResults(): boolean {
    return this._results.length > 0;
  }

  get resultCount(): number {
    return this._results.length;
  }
}

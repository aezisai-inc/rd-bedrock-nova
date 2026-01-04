/**
 * SearchResult Value Object
 */

export interface SearchResultMetadata {
  pageNumber?: number;
  chunkIndex?: number;
  sourceType?: string;
  lastModified?: string;
  [key: string]: unknown;
}

export class SearchResult {
  private constructor(
    public readonly documentId: string,
    public readonly score: number,
    public readonly excerpt: string,
    public readonly sourceUri: string | undefined,
    public readonly metadata: SearchResultMetadata | undefined
  ) {
    if (score < 0 || score > 1) {
      throw new Error('Score must be between 0 and 1');
    }
  }

  static create(
    documentId: string,
    score: number,
    excerpt: string,
    sourceUri?: string,
    metadata?: SearchResultMetadata
  ): SearchResult {
    return new SearchResult(documentId, score, excerpt, sourceUri, metadata);
  }

  get isHighRelevance(): boolean {
    return this.score >= 0.8;
  }

  get isMediumRelevance(): boolean {
    return this.score >= 0.5 && this.score < 0.8;
  }

  get isLowRelevance(): boolean {
    return this.score < 0.5;
  }

  toJSON(): Record<string, unknown> {
    return {
      documentId: this.documentId,
      score: this.score,
      excerpt: this.excerpt,
      sourceUri: this.sourceUri,
      metadata: this.metadata,
    };
  }
}

/**
 * Knowledge Feature Module (FSD)
 *
 * Public API for knowledge feature
 */

// UI Components
export { KnowledgePanel } from './ui/KnowledgePanel';

// Model (Hooks)
export {
  useKnowledgeSearch,
  useRagQuery,
  type SearchResult,
  type RagResponse,
  type Citation,
  type SearchFilters,
} from './model/use-knowledge';

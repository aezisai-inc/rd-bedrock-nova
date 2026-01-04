/**
 * Shared Module (FSD)
 *
 * Public API for shared UI components
 * Atomic Design organization
 */

// =============================================================================
// Atoms
// =============================================================================

// Button
export { Button } from './ui/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './ui/Button';

// Input & Textarea
export { Input, Textarea } from './ui/Input';
export type { InputProps, TextareaProps } from './ui/Input';

// Loading
export { Spinner, Skeleton, LoadingOverlay, ProgressBar } from './ui/Loading';
export type {
  SpinnerProps,
  SkeletonProps,
  LoadingOverlayProps,
  ProgressBarProps,
} from './ui/Loading';

// =============================================================================
// Molecules
// =============================================================================

// Card
export { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card';
export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardContentProps,
  CardFooterProps,
} from './ui/Card';

// Tabs
export { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';
export type {
  TabsProps,
  TabsListProps,
  TabsTriggerProps,
  TabsContentProps,
} from './ui/Tabs';

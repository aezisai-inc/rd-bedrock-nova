'use client';

/**
 * Loading Components - Shared UI Atoms
 *
 * FSD shared/ui layer
 * Atomic Design: Atom
 */

import React from 'react';

// =============================================================================
// Spinner
// =============================================================================

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'white';
  className?: string;
}

const spinnerSizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

const spinnerColors = {
  primary: 'text-teal-600',
  secondary: 'text-slate-600',
  white: 'text-white',
};

export function Spinner({ size = 'md', color = 'primary', className = '' }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${spinnerSizes[size]} ${spinnerColors[color]} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// =============================================================================
// Skeleton
// =============================================================================

export interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonProps) {
  const baseStyles = 'animate-pulse bg-slate-200';
  const variantStyles = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
      style={style}
    />
  );
}

// =============================================================================
// Loading Overlay
// =============================================================================

export interface LoadingOverlayProps {
  loading: boolean;
  children: React.ReactNode;
  text?: string;
}

export function LoadingOverlay({ loading, children, text }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {loading && (
        <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10 rounded-lg">
          <Spinner size="lg" />
          {text && <p className="mt-3 text-sm text-slate-600">{text}</p>}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Progress Bar
// =============================================================================

export interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const progressColors = {
  primary: 'bg-teal-600',
  success: 'bg-green-600',
  warning: 'bg-yellow-500',
  danger: 'bg-red-600',
};

const progressSizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export function ProgressBar({
  value,
  max = 100,
  color = 'primary',
  size = 'md',
  showLabel = false,
  className = '',
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={className}>
      <div className={`w-full bg-slate-200 rounded-full overflow-hidden ${progressSizes[size]}`}>
        <div
          className={`${progressColors[color]} ${progressSizes[size]} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-slate-500 mt-1 text-right">
          {Math.round(percentage)}%
        </p>
      )}
    </div>
  );
}

export default { Spinner, Skeleton, LoadingOverlay, ProgressBar };

'use client';

/**
 * Input & Textarea - Shared UI Atoms
 *
 * FSD shared/ui layer
 * Atomic Design: Atom
 */

import React, { forwardRef } from 'react';

// =============================================================================
// Input
// =============================================================================

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, iconPosition = 'left', className = '', ...props }, ref) => {
    const inputBaseStyles =
      'w-full px-4 py-2.5 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-offset-0 text-slate-800 placeholder:text-slate-400';
    const inputStateStyles = error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-slate-200 focus:border-teal-500 focus:ring-teal-500';

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`${inputBaseStyles} ${inputStateStyles} ${icon && iconPosition === 'left' ? 'pl-10' : ''} ${icon && iconPosition === 'right' ? 'pr-10' : ''} ${className}`}
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </span>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        {helperText && !error && (
          <p className="mt-1 text-sm text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// =============================================================================
// Textarea
// =============================================================================

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    const textareaBaseStyles =
      'w-full px-4 py-2.5 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-offset-0 text-slate-800 placeholder:text-slate-400 resize-none';
    const textareaStateStyles = error
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-slate-200 focus:border-teal-500 focus:ring-teal-500';

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`${textareaBaseStyles} ${textareaStateStyles} ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        {helperText && !error && (
          <p className="mt-1 text-sm text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Input;

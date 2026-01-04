'use client';

/**
 * Card - Shared UI Atom/Molecule
 *
 * FSD shared/ui layer
 * Atomic Design: Atom/Molecule
 */

import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  border?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const shadowStyles = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
};

const roundedStyles = {
  none: '',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

export function Card({
  children,
  className = '',
  padding = 'md',
  shadow = 'sm',
  rounded = 'lg',
  border = true,
}: CardProps) {
  return (
    <div
      className={`bg-white ${paddingStyles[padding]} ${shadowStyles[shadow]} ${roundedStyles[rounded]} ${border ? 'border border-slate-200' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`pb-3 border-b border-slate-100 mb-4 ${className}`}>
      {children}
    </div>
  );
}

export interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function CardTitle({ children, className = '', icon }: CardTitleProps) {
  return (
    <h3 className={`text-lg font-semibold text-slate-900 flex items-center gap-2 ${className}`}>
      {icon && <span>{icon}</span>}
      {children}
    </h3>
  );
}

export interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return <div className={className}>{children}</div>;
}

export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`pt-3 border-t border-slate-100 mt-4 ${className}`}>
      {children}
    </div>
  );
}

export default Card;

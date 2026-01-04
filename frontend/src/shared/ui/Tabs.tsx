'use client';

/**
 * Tabs - Shared UI Molecule
 *
 * FSD shared/ui layer
 * Atomic Design: Molecule
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

// =============================================================================
// Context
// =============================================================================

interface TabsContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
}

// =============================================================================
// Tabs Root
// =============================================================================

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue = '',
  value,
  onValueChange,
  children,
  className = '',
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);

  const activeTab = value !== undefined ? value : internalValue;

  const setActiveTab = useCallback(
    (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// =============================================================================
// Tabs List
// =============================================================================

export interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabsList({ children, className = '' }: TabsListProps) {
  return (
    <div
      className={`flex gap-1 p-1 bg-slate-100 rounded-lg ${className}`}
      role="tablist"
    >
      {children}
    </div>
  );
}

// =============================================================================
// Tab Trigger
// =============================================================================

export interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  children,
  className = '',
  disabled = false,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
        isActive
          ? 'bg-white text-teal-700 shadow-sm'
          : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Tab Content
// =============================================================================

export interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className = '' }: TabsContentProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) {
    return null;
  }

  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}

export default { Tabs, TabsList, TabsTrigger, TabsContent };

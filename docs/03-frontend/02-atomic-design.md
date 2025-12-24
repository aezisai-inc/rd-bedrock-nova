# Atomic Design 設計書

## 1. Atomic Design 階層

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ATOMIC DESIGN HIERARCHY                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Templates (FSD: pages)                                               │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │                      DashboardTemplate                       │   │    │
│  │  │  ┌─────────────────┬─────────────────────────────────────┐  │   │    │
│  │  │  │                 │                                      │  │   │    │
│  │  │  │    Sidebar      │           MainContent               │  │   │    │
│  │  │  │   (Organism)    │                                      │  │   │    │
│  │  │  │                 │    ┌────────────────────────────┐   │  │   │    │
│  │  │  │                 │    │        StatsGrid           │   │  │   │    │
│  │  │  │                 │    │       (Organism)           │   │  │   │    │
│  │  │  │                 │    └────────────────────────────┘   │  │   │    │
│  │  │  │                 │                                      │  │   │    │
│  │  │  └─────────────────┴─────────────────────────────────────┘  │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Organisms (FSD: shared/ui/organisms, widgets)                        │    │
│  │                                                                      │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │    │
│  │  │     Header      │  │    DataTable    │  │   ChatWindow    │     │    │
│  │  │                 │  │                 │  │                 │     │    │
│  │  │ ┌─────┐ ┌─────┐│  │ ┌─────┐ ┌─────┐│  │ ┌─────┐ ┌─────┐│     │    │
│  │  │ │Logo │ │NavM.││  │ │Table│ │Pagin││  │ │MsgL.│ │Input││     │    │
│  │  │ └─────┘ └─────┘│  │ │Row  │ │ation││  │ │     │ │     ││     │    │
│  │  └─────────────────┘  │ └─────┘ └─────┘│  │ └─────┘ └─────┘│     │    │
│  │                       └─────────────────┘  └─────────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Molecules (FSD: shared/ui/molecules)                                 │    │
│  │                                                                      │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │    │
│  │  │   FormField     │  │      Card       │  │   SearchBar     │     │    │
│  │  │                 │  │                 │  │                 │     │    │
│  │  │ ┌─────┐ ┌─────┐│  │ ┌─────┐ ┌─────┐│  │ ┌─────┐ ┌─────┐│     │    │
│  │  │ │Label│ │Input││  │ │Image│ │Text ││  │ │Input│ │Btn  ││     │    │
│  │  │ └─────┘ └─────┘│  │ └─────┘ └─────┘│  │ └─────┘ └─────┘│     │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Atoms (FSD: shared/ui/atoms)                                         │    │
│  │                                                                      │    │
│  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐      │    │
│  │  │Button │ │ Input │ │ Label │ │ Icon  │ │Spinner│ │ Badge │      │    │
│  │  └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Atoms 実装

### 2.1 Button

```tsx
// src/shared/ui/atoms/Button/Button.tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils/cn';
import { Spinner } from '../Spinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500',
        outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 focus-visible:ring-gray-500',
        ghost: 'hover:bg-gray-100 focus-visible:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ComponentPropsWithoutRef<'button'>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Spinner className="mr-2 h-4 w-4" />
        ) : leftIcon ? (
          <span className="mr-2">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !isLoading && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

### 2.2 Input

```tsx
// src/shared/ui/atoms/Input/Input.tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/shared/lib/utils/cn';

export interface InputProps extends ComponentPropsWithoutRef<'input'> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm',
          'placeholder:text-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:ring-indigo-500',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
```

### 2.3 Badge

```tsx
// src/shared/ui/atoms/Badge/Badge.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      color: {
        gray: 'bg-gray-100 text-gray-800',
        red: 'bg-red-100 text-red-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        green: 'bg-green-100 text-green-800',
        blue: 'bg-blue-100 text-blue-800',
        indigo: 'bg-indigo-100 text-indigo-800',
        purple: 'bg-purple-100 text-purple-800',
      },
    },
    defaultVariants: {
      color: 'gray',
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, color, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ color }), className)} {...props} />;
}
```

## 3. Molecules 実装

### 3.1 FormField

```tsx
// src/shared/ui/molecules/FormField/FormField.tsx
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Input, type InputProps } from '../../atoms/Input';
import { cn } from '@/shared/lib/utils/cn';

interface FormFieldProps extends InputProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, hint, required, className, id, ...props }, ref) => {
    const fieldId = id || label.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className={cn('space-y-1', className)}>
        <label
          htmlFor={fieldId}
          className="block text-sm font-medium text-gray-700"
        >
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <Input
          ref={ref}
          id={fieldId}
          error={!!error}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${fieldId}-error`} className="text-sm text-red-600">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${fieldId}-hint`} className="text-sm text-gray-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';
```

### 3.2 Card

```tsx
// src/shared/ui/molecules/Card/Card.tsx
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/cn';

interface CardProps extends ComponentPropsWithoutRef<'div'> {
  header?: ReactNode;
  footer?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, header, footer, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-gray-200 bg-white shadow-sm',
          className
        )}
        {...props}
      >
        {header && (
          <div className="border-b border-gray-200 px-6 py-4">
            {header}
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && (
          <div className="border-t border-gray-200 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';
```

### 3.3 Modal

```tsx
// src/shared/ui/molecules/Modal/Modal.tsx
'use client';

import { Fragment, type ReactNode } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/shared/lib/utils/cn';
import { Button } from '../../atoms/Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={cn(
                  'w-full transform rounded-2xl bg-white p-6 shadow-xl transition-all',
                  sizeClasses[size]
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  {title && (
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      {title}
                    </Dialog.Title>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="ml-auto"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </Button>
                </div>
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
```

## 4. Organisms 実装

### 4.1 Header

```tsx
// src/shared/ui/organisms/Header/Header.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/utils/cn';
import { Button } from '../../atoms/Button';

const navigation = [
  { name: 'ダッシュボード', href: '/dashboard' },
  { name: '音声', href: '/audio' },
  { name: 'エージェント', href: '/agent' },
  { name: '検索', href: '/search' },
];

export function Header() {
  const pathname = usePathname();
  
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-indigo-600">Nova</span>
          </Link>
          
          <nav className="hidden md:flex gap-6">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-sm font-medium transition-colors',
                  pathname.startsWith(item.href)
                    ? 'text-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm">
            ヘルプ
          </Button>
          <Button size="sm">
            ログアウト
          </Button>
        </div>
      </div>
    </header>
  );
}
```

### 4.2 DataTable

```tsx
// src/shared/ui/organisms/DataTable/DataTable.tsx
'use client';

import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { Button } from '../../atoms/Button';
import { cn } from '@/shared/lib/utils/cn';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  pageSize?: number;
}

export function DataTable<T>({ data, columns, pageSize = 10 }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });
  
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
                      header.column.getCanSort() && 'cursor-pointer select-none'
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <ChevronUpIcon className="h-4 w-4" />}
                      {header.column.getIsSorted() === 'desc' && <ChevronDownIcon className="h-4 w-4" />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {table.getState().pagination.pageIndex * pageSize + 1} -
          {Math.min((table.getState().pagination.pageIndex + 1) * pageSize, data.length)} / {data.length} 件
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            前へ
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            次へ
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## 5. テーマ設定

```css
/* src/app/styles/themes.css */
:root {
  /* Colors - Indigo Theme */
  --color-primary-50: 238 242 255;
  --color-primary-100: 224 231 255;
  --color-primary-500: 99 102 241;
  --color-primary-600: 79 70 229;
  --color-primary-700: 67 56 202;
  
  /* Typography */
  --font-sans: 'Inter', 'Noto Sans JP', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Spacing */
  --spacing-unit: 4px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

/* Dark Theme */
[data-theme='dark'] {
  --color-primary-50: 30 27 75;
  --color-primary-100: 55 48 163;
  /* ... */
}
```


import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scoreColor(value: number): string {
  if (value === 100) return '#16a34a';
  if (value === 50) return '#d97706';
  return '#dc2626';
}

export function scoreLabel(value: number): string {
  if (value === 100) return 'Full';
  if (value === 50) return 'Partial';
  return 'None';
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

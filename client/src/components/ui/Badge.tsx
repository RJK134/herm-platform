import { CATEGORY_BG } from '../../lib/constants';
import { cn } from '../../lib/utils';

interface BadgeProps {
  text: string;
  category?: string;
  className?: string;
}

export function Badge({ text, category, className }: BadgeProps) {
  const colorClass = category
    ? CATEGORY_BG[category] || 'bg-gray-100 text-gray-800'
    : 'bg-gray-100 text-gray-800';
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colorClass, className)}>
      {text}
    </span>
  );
}

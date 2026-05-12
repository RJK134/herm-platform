import { cn } from '../../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
  /**
   * Optional ARIA label used on clickable cards. When `onClick` is set,
   * the card behaves like a button and screen readers need a label.
   * Phase 14.5a — WCAG 4.1.2 (Name, Role, Value).
   */
  ariaLabel?: string;
}

export function Card({ children, className, hoverable, onClick, ariaLabel }: CardProps) {
  // Phase 14.5a — when the Card carries onClick it acts as a button. Render
  // it as <button> so it's keyboard-reachable, gets a role of `button`
  // automatically, and inherits the global `:focus-visible` outline.
  // (Previously a click-bearing <div> was unreachable via Tab and silently
  // failed WCAG 2.1.1 Keyboard.)
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          'block w-full text-left bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-shadow duration-200',
          'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2',
          className,
        )}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-shadow duration-200',
        hoverable && 'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200',
        className,
      )}
    >
      {children}
    </div>
  );
}

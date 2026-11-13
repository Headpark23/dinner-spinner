import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Join class names, skipping falsy values. */
export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-tomato text-white hover:bg-tomato-hover disabled:bg-line-strong disabled:text-ink-3',
  secondary:
    'bg-card text-ink border border-line hover:border-line-strong disabled:text-ink-3 disabled:hover:border-line',
  quiet: 'text-ink-2 hover:text-ink hover:bg-sunk disabled:text-ink-3 disabled:hover:bg-transparent',
  danger: 'bg-card text-tomato border border-line hover:border-tomato disabled:text-ink-3',
  success: 'bg-sage text-white hover:opacity-90 disabled:opacity-50',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-14 px-5 text-[17px] gap-2.5 rounded-2xl',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
  }
> = ({ variant = 'secondary', size = 'md', block, className, children, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={cx(
      'inline-flex items-center justify-center font-semibold transition-colors duration-150 select-none disabled:cursor-not-allowed active:translate-y-px',
      variantClass[variant],
      sizeClass[size],
      block && 'w-full',
      className
    )}
  >
    {children}
  </button>
);

export const IconButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }
> = ({ label, active, className, children, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    {...rest}
    className={cx(
      'inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
      active ? 'text-tomato bg-tomato-soft' : 'text-ink-2 hover:text-ink hover:bg-sunk',
      className
    )}
  >
    {children}
  </button>
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'section' }> = ({
  as = 'section',
  className,
  children,
  ...rest
}) => {
  const Tag = as;
  return (
    <Tag {...rest} className={cx('rounded-2xl border border-line bg-card', className)}>
      {children}
    </Tag>
  );
};

export const SectionHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ eyebrow, title, action, className }) => (
  <div className={cx('flex items-end justify-between gap-3', className)}>
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}
      <h2 className="font-display text-[22px] leading-tight font-semibold text-ink">{title}</h2>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

/** A single-choice segmented control (radio group semantics). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('grid gap-1 rounded-xl bg-sunk p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={cx(
              'rounded-lg font-semibold transition-colors duration-150 leading-tight',
              size === 'sm' ? 'min-h-8 px-2 text-[12px]' : 'min-h-10 px-2 text-[13px]',
              selected
                ? 'bg-card text-ink shadow-[0_1px_2px_rgba(31,26,21,0.12)]'
                : 'text-ink-2 hover:text-ink'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const Switch: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  id: string;
}> = ({ checked, onChange, label, description, id }) => (
  <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3">
    <span className="min-w-0">
      <span className="block text-[14px] font-semibold text-ink">{label}</span>
      {description && <span className="block text-[12px] text-ink-2">{description}</span>}
    </span>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150',
        checked ? 'bg-sage' : 'bg-line-strong'
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-150',
          checked && 'translate-x-5'
        )}
      />
    </button>
  </label>
);

type Tone = 'neutral' | 'sage' | 'saffron' | 'tomato' | 'outline';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunk text-ink-2',
  sage: 'bg-sage-soft text-sage',
  saffron: 'bg-saffron-soft text-saffron',
  tomato: 'bg-tomato-soft text-tomato',
  outline: 'border border-line text-ink-2',
};

export const Chip: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral',
  className,
  children,
}) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none',
      toneClass[tone],
      className
    )}
  >
    {children}
  </span>
);

export const FreshDot: React.FC<{ level: 'green' | 'amber' | 'red'; className?: string }> = ({
  level,
  className,
}) => (
  <span
    aria-hidden="true"
    className={cx(
      'inline-block h-2 w-2 shrink-0 rounded-full',
      level === 'green' ? 'bg-sage' : level === 'amber' ? 'bg-saffron' : 'bg-tomato',
      className
    )}
  />
);

export const freshnessLabel = (level: 'green' | 'amber' | 'red') =>
  level === 'red' ? 'Use next' : level === 'amber' ? 'Eat soon' : 'Fresh';

export const Notice: React.FC<{
  tone?: 'sage' | 'tomato' | 'neutral';
  icon?: React.ReactNode;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}> = ({ tone = 'neutral', icon, children, onDismiss, className }) => (
  <div
    role={tone === 'tomato' ? 'alert' : 'status'}
    className={cx(
      'fade-up flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px]',
      tone === 'sage' && 'bg-sage-soft text-sage',
      tone === 'tomato' && 'bg-tomato-soft text-tomato',
      tone === 'neutral' && 'bg-sunk text-ink-2',
      className
    )}
  >
    {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
    <div className="min-w-0 flex-1">{children}</div>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 shrink-0 rounded-md p-1 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
);

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={cx(
        'h-11 w-full rounded-xl border border-line bg-card px-3.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink-2 focus:outline-none',
        className
      )}
    />
  )
);
TextInput.displayName = 'TextInput';

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  children,
  ...rest
}) => (
  <select
    {...rest}
    className={cx(
      'h-11 rounded-xl border border-line bg-card px-3 text-[15px] text-ink focus:border-ink-2 focus:outline-none',
      className
    )}
  >
    {children}
  </select>
);

/** Accessible dialog: Escape closes, focus moves in on open and returns on close. */
export const Sheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  labelledBy: string;
}> = ({ isOpen, onClose, title, subtitle, children, labelledBy }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[rgba(20,16,12,0.55)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="fade-up relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-paper p-5 pb-8 outline-none sm:rounded-3xl sm:pb-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={labelledBy} className="font-display text-[24px] font-semibold leading-tight text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[14px] text-ink-2">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
};

/** Typographic stand-in for a dish photo: cuisine initial on a tinted tile. */
const cuisineTint: Record<string, string> = {
  Italian: '#7d8b3f',
  Indian: '#b4652a',
  Chinese: '#a83a2b',
  British: '#6d5a44',
  Mexican: '#b0482f',
  Thai: '#4f7a5c',
  Greek: '#3f6a86',
  Mediterranean: '#3f6a86',
};
export const cuisineColor = (cuisine?: string) => cuisineTint[cuisine || ''] || '#7a6a58';

export const DishTile: React.FC<{ cuisine?: string; imageUrl?: string; size?: number; className?: string }> = ({
  cuisine,
  imageUrl,
  size = 48,
  className,
}) =>
  imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cx('shrink-0 rounded-xl object-cover', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cx('inline-flex shrink-0 items-center justify-center rounded-xl font-display font-semibold text-white', className)}
      style={{ width: size, height: size, background: cuisineColor(cuisine), fontSize: size * 0.42 }}
    >
      {(cuisine || '?').charAt(0)}
    </span>
  );

export const timeLabel = (t: string) =>
  t === '20m' ? '20 min' : t === '30m' ? '30 min' : t === '60m' ? '1 hour' : 'All day';
export const effortLabel = (e: string) =>
  e === 'one-pot' ? 'One pot' : e === 'standard' ? 'Standard' : 'Chef mode';

import { flagCodeFor, FlagTile } from './CuisineFlag';
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Join class names, skipping falsy values. */
export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary-tactile text-white disabled:text-ink-3',
  secondary:
    'editorial-card bg-card text-ink border border-line hover:border-line-strong hover:bg-sunk/45 disabled:text-ink-3 disabled:hover:border-line',
  quiet: 'text-ink-2 hover:text-ink hover:bg-sunk/75 disabled:text-ink-3 disabled:hover:bg-transparent',
  danger: 'bg-tomato-soft/55 text-tomato border border-tomato/25 hover:bg-tomato-soft hover:border-tomato/45 disabled:text-ink-3',
  success:
    'bg-sage text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_-3px_rgba(51,98,68,0.4)] hover:opacity-95 disabled:opacity-50',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-xl',
  lg: 'h-14 px-5 text-[16px] gap-2.5 rounded-2xl tracking-[-0.01em]',
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
      'inline-flex items-center justify-center font-semibold transition-[transform,opacity,background-color,border-color] duration-150 select-none disabled:cursor-not-allowed active:translate-y-px',
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
      'inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
      active ? 'text-tomato bg-tomato-soft ring-1 ring-tomato/20' : 'text-ink-2 hover:text-ink hover:bg-sunk/80',
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
    <Tag {...rest} className={cx('editorial-card rounded-[20px] border border-line/90 bg-card', className)}>
      {children}
    </Tag>
  );
};

/** Every screen opens the same way: an editorial serif title, one warm sentence, and at most one action. */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  eyebrow?: string;
  className?: string;
}> = ({ title, subtitle, action, eyebrow, className }) => (
  <div className={cx('flex items-start justify-between gap-3', className)}>
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
      <h1 className="font-display text-[30px] leading-[1.08] font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0 pt-0.5">{action}</div>}
  </div>
);

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

/** A single-choice segmented control (radio group semantics) with tactile inset track. */
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
      className={cx('grid gap-1 rounded-2xl border border-line/80 bg-sunk/85 p-1 shadow-[inset_0_1px_2px_rgba(28,22,17,0.06)]', className)}
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
              'rounded-xl font-semibold transition-[background-color,color,box-shadow] duration-150 leading-tight',
              size === 'sm' ? 'min-h-10 px-2 text-[13px]' : 'min-h-11 px-2 text-[13px]',
              selected
                ? 'bg-card text-ink ring-1 ring-line/70 shadow-[0_2px_6px_rgba(28,22,17,0.09)]'
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
  sage: 'bg-sage-soft text-sage ring-1 ring-sage/15',
  saffron: 'bg-saffron-soft text-saffron ring-1 ring-saffron/18',
  tomato: 'bg-tomato-soft text-tomato ring-1 ring-tomato/18',
  outline: 'border border-line bg-card/80 text-ink-2',
};

export const Chip: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral',
  className,
  children,
}) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none',
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
      'inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-card',
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
      'fade-up flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-[14px]',
      tone === 'sage' && 'border-sage/20 bg-sage-soft text-sage',
      tone === 'tomato' && 'border-tomato/20 bg-tomato-soft text-tomato',
      tone === 'neutral' && 'border-line bg-sunk/85 text-ink-2',
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
        'h-11 w-full rounded-xl border border-line bg-card px-3.5 text-[15px] text-ink shadow-[inset_0_1px_2px_rgba(28,22,17,0.04)] placeholder:text-ink-3 focus:border-tomato/60 focus:outline-none',
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
      'h-11 rounded-xl border border-line bg-card px-3 text-[15px] text-ink shadow-[inset_0_1px_2px_rgba(28,22,17,0.04)] focus:border-tomato/60 focus:outline-none',
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
  /** Fill most of the screen on a phone, so the page behind clearly isn't the thing to use. */
  tall?: boolean;
}> = ({ isOpen, onClose, title, subtitle, children, labelledBy, tall }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Runs only when the sheet opens/closes, so typing inside never loses focus.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sheet = (
    <div className="fixed inset-x-0 top-0 z-50 flex h-dvh items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-[rgba(18,14,10,0.58)] backdrop-blur-[3px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cx(
          'fade-up relative w-full max-w-lg overflow-y-auto rounded-t-[28px] border-t border-line bg-paper p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-elevated)] outline-none sm:rounded-[28px] sm:border sm:pb-6',
          tall ? 'max-h-[94dvh] min-h-[88dvh] sm:min-h-0 sm:max-h-[90dvh]' : 'max-h-[88dvh] sm:max-h-[90dvh]'
        )}
      >
        <div className="mx-auto -mt-1.5 mb-3 h-1 w-10 rounded-full bg-line-strong/80 sm:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={labelledBy} className="font-display text-[25px] font-semibold leading-tight text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[14px] leading-snug text-ink-2">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 bg-sunk/60">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body);
};

/** Typographic stand-in for a dish photo: cuisine initial on a warm editorial tile. */
const cuisineTint: Record<string, string> = {
  Italian: '#6c7c36',
  Indian: '#b56124',
  Chinese: '#a43627',
  British: '#65513b',
  Mexican: '#ae452b',
  Thai: '#457253',
  Greek: '#3a6480',
  Mediterranean: '#3a6480',
  French: '#584b6b',
  Japanese: '#8d433b',
  Spanish: '#a85226',
};
export const cuisineColor = (cuisine?: string) => cuisineTint[cuisine || ''] || '#786653';

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
      className={cx('shrink-0 rounded-xl object-cover ring-1 ring-black/8', className)}
      style={{ width: size, height: size }}
    />
  ) : flagCodeFor(cuisine) ? (
    <FlagTile code={flagCodeFor(cuisine)!} size={size} className={className} />
  ) : (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-display font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]',
        className
      )}
      style={{ width: size, height: size, background: cuisineColor(cuisine), fontSize: size * 0.42 }}
    >
      {(cuisine || '?').charAt(0)}
    </span>
  );

export const timeLabel = (t: string) =>
  t === '20m' ? '20 min' : t === '30m' ? '30 min' : t === '60m' ? '1 hour' : 'All day';
export const effortLabel = (e: string) =>
  e === 'one-pot' ? 'One pot' : e === 'standard' ? 'Standard' : 'Chef mode';

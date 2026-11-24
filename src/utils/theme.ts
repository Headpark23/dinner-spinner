import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'dinner_spinner_theme';
const COLORS: Record<Theme, string> = { light: '#F4EFE6', dark: '#13110F' };

const systemTheme = (): Theme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

/** What the page is showing now: the saved choice if there is one, otherwise the device's setting. */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const set = document.documentElement.getAttribute('data-theme');
  return set === 'light' || set === 'dark' ? set : systemTheme();
}

/** Save a choice and apply it (the colour tokens switch on the data-theme attribute). */
export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode: the choice just won't survive a reload
  }
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', COLORS[theme]);
    m.removeAttribute('media');
  });
}

/** The current theme and a button action to flip it. Follows the device setting until a choice is made. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => {
      if (!document.documentElement.getAttribute('data-theme')) setTheme(systemTheme());
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }, []);

  return { theme, toggleTheme };
}

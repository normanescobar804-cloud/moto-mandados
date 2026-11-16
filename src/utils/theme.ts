import { createContext, useContext } from 'react';
import { ThemePreference } from '../types';

export const THEME_STORAGE_GLOBAL_KEY = 'motomando_theme_global';

export interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function getInitialTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_GLOBAL_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // Ignore localStorage access errors
  }
  return 'light';
}

export function getStoredUserTheme(uid: string): ThemePreference | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const stored = window.localStorage.getItem(`motomando_theme_${uid}`);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // Ignore localStorage access errors
  }
  return null;
}

export function persistLocalTheme(theme: ThemePreference, uid?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_GLOBAL_KEY, theme);
    if (uid) {
      window.localStorage.setItem(`motomando_theme_${uid}`, theme);
    }
  } catch {
    // Ignore localStorage access errors
  }
}

export function applyDocumentTheme(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isDark ? '#090E1A' : '#EA580C');
  }
}

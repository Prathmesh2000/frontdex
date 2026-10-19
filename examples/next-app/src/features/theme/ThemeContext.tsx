'use client';
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';

type Theme = 'light' | 'dark';
export const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({ theme: 'light', toggleTheme: () => {} });

/** Follows the OS colour scheme until the user picks one. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [userChoice, setUserChoice] = useState<Theme | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => !userChoice && setTheme(media.matches ? 'dark' : 'light');
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [userChoice]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setUserChoice(next);
    setTheme(next);
  };
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

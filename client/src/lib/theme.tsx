import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
interface ThemeCtx { theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void; reducedMotion: boolean }
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('uj.theme') as Theme) || 'system';
    } catch {
      return 'system';
    }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [reducedMotion, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => setSystemDark(mq.matches);
    const onRm = () => setReduced(rm.matches);
    mq.addEventListener('change', onMq);
    rm.addEventListener('change', onRm);
    return () => {
      mq.removeEventListener('change', onMq);
      rm.removeEventListener('change', onRm);
    };
  }, []);
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    try {
      localStorage.setItem('uj.theme', theme);
    } catch {
      /* ignore */
    }
  }, [resolved, theme]);
  const value = useMemo(() => ({ theme, resolved, setTheme, reducedMotion }), [theme, resolved, reducedMotion]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside provider');
  return v;
}

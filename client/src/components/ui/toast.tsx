import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import clsx from 'clsx';

type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: Tone; title: string; body?: string }
interface ToastCtx { toast: (title: string, opts?: { body?: string; tone?: Tone }) => void; success: (t: string, b?: string) => void; error: (t: string, b?: string) => void; info: (t: string, b?: string) => void }
const Ctx = createContext<ToastCtx | null>(null);
let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((title: string, opts: { body?: string; tone?: Tone } = {}) => {
    const id = seq++;
    setItems((s) => [...s, { id, title, body: opts.body, tone: opts.tone ?? 'info' }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5000);
  }, []);
  const value = useMemo<ToastCtx>(() => ({ toast, success: (t, b) => toast(t, { body: b, tone: 'success' }), error: (t, b) => toast(t, { body: b, tone: 'error' }), info: (t, b) => toast(t, { body: b, tone: 'info' }) }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-20 end-4 z-[120] flex w-[min(92vw,360px)] flex-col gap-2 sm:bottom-4" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} className="pointer-events-auto glass flex items-start gap-3 rounded-2xl p-3.5 shadow-lg">
              {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : t.tone === 'error' ? <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" /> : <Info className="mt-0.5 h-5 w-5 text-info" />}
              <div className="min-w-0 flex-1 text-sm">
                <div className={clsx('font-semibold', t.tone === 'error' && 'text-danger')}>{t.title}</div>
                {t.body && <div className="text-muted">{t.body}</div>}
              </div>
              <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="rounded p-1 text-muted hover:text-fg" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
export function useToast(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside provider');
  return v;
}

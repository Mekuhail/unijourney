import { can as canDo, type Capability } from '@shared/access';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@shared/types';
import { api } from './api';
import { bus, refreshAll } from './bus';

export interface Persona {
  id: string;
  name_en: string;
  name_ar: string;
  roles: User['roles'];
  stage: string;
  campus_id: string;
  avatar_color: string;
  program_id: string | null;
  department: string | null;
}

interface Session {
  user: User | null;
  personas: Persona[];
  demoMode: boolean;
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  switchPersona: (id: string) => Promise<void>;
  hasRole: (...roles: User['roles']) => boolean;
  /** Role → capability matrix (shared/access.ts); the server enforces the same rules. */
  can: (cap: Capability) => boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: User | null; demoMode: boolean; unread: number }>('/session/me');
      setUser(me.user);
      setDemoMode(me.demoMode);
      setUnread(me.unread);
      if (me.demoMode) setPersonas(await api<Persona[]>('/session/personas'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return bus.on('refresh', () => void refresh());
  }, [refresh]);

  const switchPersona = useCallback(
    async (id: string) => {
      await api('/session/switch', { body: { personaId: id } });
      await refresh();
      refreshAll('persona');
    },
    [refresh]
  );

  const value = useMemo<Session>(
    () => ({ user, personas, demoMode, unread, loading, refresh, switchPersona, hasRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)), can: (cap) => canDo(user?.roles, cap) }),
    [user, personas, demoMode, unread, loading, refresh, switchPersona]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside provider');
  return v;
}

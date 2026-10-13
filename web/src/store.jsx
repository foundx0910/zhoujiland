import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    actor: null,
    user: null,
    unread: 0,
    pendingReports: 0,
  });
  const [flash, setFlash] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.get('/api/auth/me');
      setState({
        loading: false,
        actor: d.actor,
        user: d.user,
        unread: d.unread_notifications ?? 0,
        pendingReports: d.pending_reports ?? 0,
      });
    } catch {
      setState({ loading: false, actor: null, user: null, unread: 0, pendingReports: 0 });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const notify = useCallback((message, kind = 'info') => {
    setFlash({ message, kind, at: Date.now() });
    setTimeout(() => setFlash((f) => (f && Date.now() - f.at >= 2600 ? null : f)), 3000);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      isAdmin: state.user?.role === 'admin',
      unread: state.unread,
      pendingReports: state.pendingReports,
      setUnread: (n) => setState((s) => ({ ...s, unread: n })),
      canSpeak: state.actor?.type === 'user' || !!state.actor?.name,
      displayName: state.actor?.name || '',
      refresh,
      notify,
      flash,
      dismissFlash: () => setFlash(null),
      setGuestName: async (name) => {
        await api.post('/api/auth/guest', { name });
        await refresh();
      },
      logout: async () => {
        await api.post('/api/auth/logout');
        await refresh();
      },
    }),
    [state, refresh, notify, flash]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

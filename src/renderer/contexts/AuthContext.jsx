import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      api.get('/me').then(res => {
        setUser(res.data.user);
        localStorage.setItem('user', JSON.stringify(res.data.user));
      }).catch(() => {
        logout();
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // App-side auto-pay cron — runs every minute while this window is open
  // and the seller has auto_pay=true. POST /orders/auto-pay/run; backend
  // settles oldest-first unpaid orders against the wallet.
  useEffect(() => {
    if (!user?.auto_pay) return;
    const tick = () => api.post('/orders/auto-pay/run').catch(() => {});
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [user?.id, user?.auto_pay]);

  const login = async (email, password) => {
    const res = await api.post('/login', { email, password });
    const { token, user } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = async () => {
    try { await api.post('/logout'); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const hasRole = (role) => user?.role?.slug === role;
  const hasPermission = (module, action = 'can_view') => {
    if (!user?.role?.permissions) return false;
    const perm = user.role.permissions.find(p => p.module === module);
    return perm?.[action] ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

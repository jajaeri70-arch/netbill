import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api.js';

const AuthContext = createContext(null);
const IDLE_TIMEOUT_MS = Math.max(1, Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES || 30)) * 60 * 1000;
const LAST_ACTIVITY_KEY = 'netbill_last_activity';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('netbill_token'));
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef(null);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setPermissions(data.permissions || {});
    } catch {
      setToken(null);
      localStorage.removeItem('netbill_token');
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadMe();
    else setLoading(false);
  }, [token, loadMe]);

  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('netbill_token', data.token);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    setToken(data.token);
    setUser(data.user);
    await loadMe();
    return data;
  };

  const register = async (name, email, password, role) => {
    const { data } = await api.post('/auth/register', { name, email, password, role });
    return data;
  };

  const logout = useCallback(() => {
    clearTimeout(idleTimer.current);
    localStorage.removeItem('netbill_token');
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setToken(null);
    setUser(null);
    setPermissions({});
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    const expire = () => logout();
    const reset = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(expire, IDLE_TIMEOUT_MS);
    };
    const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    const remaining = lastActivity ? IDLE_TIMEOUT_MS - (Date.now() - lastActivity) : IDLE_TIMEOUT_MS;
    if (remaining <= 0) expire();
    else idleTimer.current = setTimeout(expire, remaining);

    const events = ['keydown', 'mousedown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      clearTimeout(idleTimer.current);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [token, logout]);

  const can = (menu, action = 'view') => {
    const p = permissions?.[menu];
    return !!(p && p[action]);
  };

  return (
    <AuthContext.Provider value={{ token, user, permissions, loading, login, register, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

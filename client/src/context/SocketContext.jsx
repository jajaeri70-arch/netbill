import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [lastNotification, setLastNotification] = useState(null);
  const [customersUpdatedAt, setCustomersUpdatedAt] = useState(null);

  useEffect(() => {
    if (!token) return;
    const socket = io('/', { transports: ['websocket', 'polling'] });
    socket.on('monitoring:update', (data) => setSnapshot(data));
    socket.on('notification:new', (n) => setLastNotification({ ...n, _at: Date.now() }));
    socket.on('customers:changed', () => setCustomersUpdatedAt(Date.now()));
    return () => socket.disconnect();
  }, [token]);

  return (
    <SocketContext.Provider value={{ snapshot, lastNotification, customersUpdatedAt }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);

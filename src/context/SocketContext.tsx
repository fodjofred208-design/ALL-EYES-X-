import React, { createContext, useContext, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../utils/api';
import { socketOptions } from '../utils/socketOptions';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}



const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);

 useEffect(() => {
  const socket = io(SOCKET_URL || '/', socketOptions);

  socket.on('connect', () => {
    console.log('[SocketIO] Connected');
    setIsConnected(true);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[SocketIO] Disconnected:', reason);
    setIsConnected(false);
  });

  socket.on('connect_error', (err) => {
    console.warn('[SocketIO] Connection error:', err.message);
    setIsConnected(false);
  });

  socketRef.current = socket;

  return () => {
    socket.removeAllListeners();
    socket.disconnect();
  };

}, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
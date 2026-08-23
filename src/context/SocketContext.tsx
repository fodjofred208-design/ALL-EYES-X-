import React, { createContext, useContext, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../utils/api';

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
  const socket = io("/", {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[SocketIO] Connected');
    setIsConnected(true);
  });

  socket.on('disconnect', () => {
    console.log('[SocketIO] Disconnected');
    setIsConnected(false);
  });

  socket.on('connect_error', (err) => {
    console.warn('[SocketIO] Connection error:', err.message);
    setIsConnected(false);
  });

  socketRef.current = socket;

  return () => {
    socket.removeAllListeners();
  };

}, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
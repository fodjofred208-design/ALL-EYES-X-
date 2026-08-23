import React, { createContext, useContext, useState, ReactNode } from 'react';

interface WelcomeCtx { show: boolean; dismiss: () => void; reset: () => void; }
const Ctx = createContext<WelcomeCtx>({ show: true, dismiss: () => {}, reset: () => {} });

export const WelcomeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [show, setShow] = useState(true);
  return (
    <Ctx.Provider value={{ show, dismiss: () => setShow(false), reset: () => setShow(true) }}>
      {children}
    </Ctx.Provider>
  );
};

export const useWelcome = () => useContext(Ctx);
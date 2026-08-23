import React from 'react';
import Sidebar from './Sidebar';
import NotificationCenter from './NotificationCenter';


interface LayoutProps {
  children: React.ReactNode;
  onLogout?: () => void;
}


const Layout: React.FC<LayoutProps> = ({
  children,
  onLogout
}) => {

  return (

    <div className="min-h-screen relative">


      <div className="aurora-bg">

        <div className="aurora-wave aurora-wave-1" />
        <div className="aurora-wave aurora-wave-2" />
        <div className="aurora-wave aurora-wave-3" />

      </div>


      <div className="scanline" />


      <Sidebar onLogout={onLogout ?? (() => {})} />


      <NotificationCenter />


      <main className="relative z-10">

        {children}

      </main>


    </div>

  );

};


export default Layout;
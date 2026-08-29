import React, { useState, useEffect, useRef } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

const NeuralEye: React.FC<{ size?: number; active?: boolean; color?: string; speed?: number }> = ({ 
  size = 200, 
  active = true,
  color = "#22c55e",
  speed = 1,
}) => {
  // Every animation duration is divided by `speed`, so a caller (the login
  // lockdown state) can make the eye visibly more agitated without duplicating
  // the component.
  const d = (seconds: number) => seconds / speed;
  const [isBlinking, setIsBlinking] = useState(false);
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const springConfig = { damping: 18 / speed, stiffness: 150 * speed * 2.2 };
  const pupilX = useSpring(mouseX, springConfig);
  const pupilY = useSpring(mouseY, springConfig);

  const autoMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (autoMoveTimer.current) clearTimeout(autoMoveTimer.current);
      
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      mouseX.set(x);
      mouseY.set(y);

      autoMoveTimer.current = setTimeout(() => {
        startAutoMove();
      }, d(0.7));
    };

    let autoInterval: ReturnType<typeof setInterval> | null = null;
    const startAutoMove = () => {
      if (autoInterval) clearInterval(autoInterval);
      autoInterval = setInterval(() => {
        const x = (Math.random() - 0.5) * 16;
        const y = (Math.random() - 0.5) * 16;
        mouseX.set(x);
        mouseY.set(y);
      }, d(0.9));
    };

    window.addEventListener('mousemove', handleMouseMove);
    startAutoMove();
    
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.4) {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 120);
      }
    }, d(2.2));

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearInterval(blinkInterval);
      if (autoInterval) clearInterval(autoInterval);
      if (autoMoveTimer.current) clearTimeout(autoMoveTimer.current);
    };
  }, [mouseX, mouseY, speed]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Outer Glow */}
      <motion.div 
        className="absolute rounded-full blur-3xl"
        style={{ 
          backgroundColor: color,
          width: size * 1.5, 
          height: size * 1.5,
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.2, 0.08] }}
        transition={{ duration: d(2.4), repeat: Infinity }}
      />

      {/* Outer decorative rings */}
      <div className="absolute border border-white/[0.03] rounded-full" style={{ width: size * 1.4, height: size * 1.4 }} />
      <div className="absolute border border-white/[0.05] rounded-full" style={{ width: size * 1.25, height: size * 1.25 }} />
      
      {/* Sclera */}
      <div className="relative w-full h-full rounded-full bg-gradient-to-b from-[#0f1520] via-[#0a0e18] to-[#060810] border-2 border-white/[0.06] overflow-hidden flex items-center justify-center shadow-[inset_0_0_60px_rgba(0,0,0,0.9)]">
        
        {/* Subtle vein texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(${color === '#22c55e' ? '34,197,94' : '0,212,255'},0.1) 40px, transparent 41px),
                           repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(${color === '#22c55e' ? '34,197,94' : '0,212,255'},0.1) 40px, transparent 41px)`
        }} />

        {/* Iris Container */}
        <motion.div 
          className="relative rounded-full overflow-hidden"
          style={{ 
            x: pupilX, 
            y: pupilY,
            width: '68%',
            height: '68%',
            background: `radial-gradient(circle at 40% 40%, ${color}40 0%, ${color}20 30%, #000 70%)`,
            boxShadow: `inset 0 0 30px ${color}15, 0 0 20px ${color}10`
          }}
        >
          {/* Iris base color */}
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse at center, ${color}50 0%, ${color}20 40%, #030508 80%)`
          }} />
          
          {/* Iris fiber texture */}
          {[...Array(24)].map((_, i) => (
            <div 
              key={`fiber-${i}`}
              className="absolute top-1/2 left-1/2 w-full h-[1px] origin-left"
              style={{ 
                transform: `rotate(${i * 15}deg)`,
                background: `linear-gradient(to right, transparent 20%, ${color}15 50%, transparent 80%)`
              }}
            />
          ))}

          {/* === 3 CIRCULAR SCANNING VALVES === */}
          {[0, 1, 2].map((ring) => {
            const ringSize = 25 + ring * 18;
            const ringSpeed = d(2.4 + ring * 1.2);
            const direction = ring % 2 === 0 ? 'normal' : 'reverse';
            const dashSize = ring === 0 ? '30 70' : ring === 1 ? '20 80' : '40 60';
            
            return (
              <svg 
                key={`scan-ring-${ring}`}
                className="absolute top-1/2 left-1/2"
                style={{
                  width: `${ringSize}%`,
                  height: `${ringSize}%`,
                  transform: 'translate(-50%, -50%)',
                  animation: `spin ${ringSpeed}s linear infinite`,
                  animationDirection: direction as any
                }}
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray={dashSize}
                  opacity="0.6"
                />
                {/* Scanner dot on the ring */}
                <circle
                  cx="95"
                  cy="50"
                  r="2"
                  fill={color}
                  opacity="0.9"
                />
              </svg>
            );
          })}

          {/* Middle rotating valve with thicker line */}
          <motion.div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: '55%', height: '55%' }}
            animate={{ rotate: 360 }}
            transition={{ duration: d(3.2), repeat: Infinity, ease: "linear" }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-full opacity-20"
              style={{ background: `linear-gradient(to bottom, transparent, ${color}, transparent)` }}
            />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] w-full opacity-20"
              style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }}
            />
          </motion.div>

          {/* Dominant Black Pupil */}
          <motion.div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black"
            style={{ 
              width: '38%', 
              height: '38%',
              boxShadow: `0 0 40px 10px rgba(0,0,0,0.9), inset 0 0 20px ${color}10`
            }}
            animate={{ scale: active ? [1, 1.05, 1] : 1 }}
            transition={{ duration: d(1.3), repeat: Infinity }}
          >
            {/* Primary reflection */}
            <div className="absolute top-[18%] left-[18%] w-3 h-3 bg-white/40 rounded-full blur-[1px]" />
            {/* Secondary reflection */}
            <div className="absolute top-[55%] left-[60%] w-1.5 h-1.5 bg-white/20 rounded-full blur-[0.5px]" />
            {/* Inner glow ring */}
            <div className="absolute inset-0 rounded-full" style={{
              boxShadow: `inset 0 0 8px ${color}30`
            }} />
          </motion.div>

          {/* Energy pulse ring */}
          {active && (
            <motion.div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{ borderColor: color }}
              animate={{ 
                width: ['40%', '90%'], 
                height: ['40%', '90%'], 
                opacity: [0.4, 0] 
              }}
              transition={{ duration: d(1.3), repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </motion.div>

        {/* Horizontal scan sweep */}
        <motion.div 
          className="absolute w-full h-[1px] z-20"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          animate={{ top: ['0%', '100%', '0%'] }}
          transition={{ duration: d(1.8), repeat: Infinity, ease: "linear" }}
        />

        {/* Human-like Blinking Eyelids */}
        <motion.div 
          className="absolute top-0 left-0 w-full bg-gradient-to-b from-[#060810] via-[#080c16] to-[#060810] z-30"
          animate={{ height: isBlinking ? '50%' : '0%' }}
          transition={{ duration: 0.08 }}
        />
        <motion.div 
          className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#060810] via-[#080c16] to-[#060810] z-30"
          animate={{ height: isBlinking ? '50%' : '0%' }}
          transition={{ duration: 0.08 }}
        />

        {/* Eyelid shadows for realism */}
        <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-black/40 to-transparent z-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-full h-6 bg-gradient-to-t from-black/30 to-transparent z-20 pointer-events-none" />
      </div>

      {/* CSS Keyframes for valve rotation */}
      <style>{`
        @keyframes spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default NeuralEye;

import React, { useState, useEffect, useRef } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

// ---------------------------------------------------------------------------
// Animation timings, in seconds, as specified for every eye in the app.
// The `speed` prop divides them (see `d`) so a caller such as the login
// lockdown state can make the eye more agitated without a second component.
// ---------------------------------------------------------------------------
const SCAN_VALVE_SECONDS = [6, 9, 12];  // three valve rings, inner to outer
const CROSSHAIR_SECONDS = 8;            // middle cross-hair valve
const SCAN_SWEEP_SECONDS = 3.5;         // horizontal sweep line
const PUPIL_BREATH_SECONDS = 2.5;       // pupil scale breathing
const IDLE_WANDER_SECONDS = 2.5;        // pupil drift while the mouse is still
const BLINK_SECONDS = 3;                // blink interval
const IDLE_RESUME_SECONDS = 1.2;        // mouse must be still this long first

// Where the eye looks by itself when no cursor is present. Deliberate, small
// offsets rather than random jitter: each glance is a brief saccade that the
// spring eases into, then the eye rests there until the next one - which is how
// a real eye behaves. Amplitudes stay small so the pupil never leaves the iris.
const GAZE_TARGETS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },    // centre
  { x: -9, y: 0 },   // left
  { x: 9, y: 0 },    // right
  { x: 0, y: -7 },   // up
  { x: 8, y: -6 },   // up-right
  { x: -8, y: -6 },  // up-left
  { x: 0, y: 6 },    // down
];

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
  
  const springConfig = { damping: 22, stiffness: 260 * speed };
  const pupilX = useSpring(mouseX, springConfig);
  const pupilY = useSpring(mouseY, springConfig);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wanderTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const stopWander = () => {
      if (wanderTimer.current) {
        clearInterval(wanderTimer.current);
        wanderTimer.current = null;
      }
    };

    // The iris follows the cursor whenever one is present. Idle gaze only runs
    // once the mouse has been still for a moment.
    // Previously this started on mount and was never stopped while the mouse
    // moved, so it overwrote the mouse position every 0.9s - two writers
    // fighting over the same motion values, which is what made it jitter.
    let lastGaze = -1;
    const startWander = () => {
      stopWander();
      wanderTimer.current = setInterval(() => {
        // Never pick the same gaze twice in a row, so the eye does not twitch
        // between two spots.
        let next = lastGaze;
        while (next === lastGaze) {
          next = Math.floor(Math.random() * GAZE_TARGETS.length);
        }
        lastGaze = next;
        mouseX.set(GAZE_TARGETS[next].x);
        mouseY.set(GAZE_TARGETS[next].y);
      }, d(IDLE_WANDER_SECONDS));
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Mouse wins: stop wandering immediately and follow the cursor.
      stopWander();
      if (idleTimer.current) clearTimeout(idleTimer.current);

      mouseX.set((e.clientX / window.innerWidth - 0.5) * 30);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 30);

      // Resume idle wander only after the mouse has been still.
      idleTimer.current = setTimeout(startWander, d(IDLE_RESUME_SECONDS));
    };

    window.addEventListener('mousemove', handleMouseMove);
    // Begin wandering right away so the eye is alive before any mouse input.
    startWander();

    // Blink every 3 seconds, as specified.
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 120);
    }, d(BLINK_SECONDS));

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearInterval(blinkInterval);
      stopWander();
      if (idleTimer.current) clearTimeout(idleTimer.current);
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
            const ringSpeed = d(SCAN_VALVE_SECONDS[ring] ?? 6);
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
            transition={{ duration: d(CROSSHAIR_SECONDS), repeat: Infinity, ease: "linear" }}
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
            transition={{ duration: d(PUPIL_BREATH_SECONDS), repeat: Infinity }}
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
          transition={{ duration: d(SCAN_SWEEP_SECONDS), repeat: Infinity, ease: "linear" }}
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

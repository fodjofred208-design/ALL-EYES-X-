
import React, { useEffect, useState } from 'react';
import NeuralEye from '../NeuralEye';
import ConstellationBackground from '../ConstellationBackground';
import { useWelcome } from '../../context/WelcomeContext';

const DESCRIPTION =
  'ALL EYES X is an advanced cybersecurity monitoring platform designed to provide centralized visibility, ' +
  'real-time intelligence, and complete situational awareness across every connected device. Built for modern ' +
  'Security Operations Centers (SOC), it combines live monitoring, threat detection, device intelligence, and ' +
  'administrative control within a unified command environment.';

/* Self-contained typewriter — no external dependency */
const Typewriter: React.FC<{ text: string; speed?: number; startDelay?: number }> = ({
  text, speed = 14, startDelay = 2600,
}) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let i = 0;
    let iv: ReturnType<typeof setInterval> | null = null;
    const to = setTimeout(() => {
      iv = setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length && iv) clearInterval(iv);
      }, speed);
    }, startDelay);
    return () => { clearTimeout(to); if (iv) clearInterval(iv); };
  }, [text, speed, startDelay]);
  return (
    /* Fixed height + left/top anchoring: as characters are typed the block
       grows DOWNWARD, so the eye/title above never shift upward. */
    <div className="aeyes-typewriter">
      <p className="font-mono-data text-xs md:text-sm leading-relaxed text-slate-400">
        {text.slice(0, count)}
        {count < text.length && <span className="aeyes-caret" style={{ height: '1em' }} />}
      </p>
    </div>
  );
};

const WelcomeExperience: React.FC = () => {
  const { dismiss } = useWelcome();

  return (
    /* Full viewport height with the fixed 4rem header accounted for, so the
       block sits optically centred instead of riding high with dead space
       underneath. */
    <div className="aeyes-welcome-bg relative min-h-screen w-full pt-16 pb-10 flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* constellation — same as loading screen, green */}
      <div className="absolute inset-0 z-0">
        <ConstellationBackground color="#22c55e" />
      </div>

      {/* deep green breathing glow behind the eye */}
      <div className="aeyes-eye-glow z-0" />

      {/* YOUR NeuralEye — same component as Loading + Login, follows cursor,
          wanders when idle, blinks automatically */}
      <div className="we-eye relative z-10">
        <NeuralEye size={260} color="#22c55e" />
      </div>

      <h1 className="we-title neon-text mt-8 text-center font-orbitron font-bold text-3xl md:text-5xl tracking-[0.25em]">
        WELCOME TO ALL EYES X
      </h1>

      <p className="we-subtitle mt-3 text-center font-mono-data text-sm md:text-base text-[#22c55e] tracking-[0.35em] uppercase">
        Futuristic Universal Monitoring Software
      </p>

      <div className="we-desc max-w-2xl mt-8 w-full flex flex-col items-start">
        <Typewriter text={DESCRIPTION} />
      </div>

      <button onClick={dismiss} className="aeyes-btn-enter we-btn mt-10">
        Enter Command Center
      </button>

      <p
        className="we-footer mt-6 font-mono-data text-[10px] text-[#22c55e]"
        style={{ textShadow: '0 0 8px rgba(34,197,94,0.5)' }}
      >
        Made by Fred
      </p>
    </div>
  );
};

export default WelcomeExperience;
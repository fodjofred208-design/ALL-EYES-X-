import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, User, ShieldCheck, AlertTriangle } from 'lucide-react';
import NeuralEye from '../components/NeuralEye';
import ConstellationBackground from '../components/ConstellationBackground';
import { apiFetch } from '../utils/api';

const LOCK_THRESHOLD = 5;

const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [securityState, setSecurityState] = useState(false);

  const handleRecovery = async () => {
    setIsLoading(true);
    setError('');
    try {
      await apiFetch('/api/auth/recover', {
        method: 'POST',
        body: JSON.stringify({ phrase: recoveryPhrase }),
      });
      setSecurityState(false);
      setFailedAttempts(0);
      setPassword('');
      setRecoveryPhrase('');
      setError('SECURITY STATE CLEARED — NORMAL LOGIN RESTORED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'INVALID RECOVERY PHRASE');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (securityState) {
      await handleRecovery();
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await apiFetch<{ success: boolean; locked?: boolean; attempts?: number; threshold?: number; message?: string; error?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (result.success) {
        setFailedAttempts(0);
        setSecurityState(false);
        onLogin();
        return;
      }

      const attempts = result.attempts ?? failedAttempts + 1;
      setFailedAttempts(attempts);
      if (result.locked || attempts >= (result.threshold ?? LOCK_THRESHOLD)) setSecurityState(true);
      setError(result.message || result.error || 'ACCESS DENIED: NEURAL KEY MISMATCH');
    } catch (err) {
      const attempts = failedAttempts + 1;
      setFailedAttempts(attempts);
      const message = err instanceof Error ? err.message : 'ACCESS DENIED';
      const lockNow = message.toLowerCase().includes('security state') || attempts >= 3;
      if (lockNow) setSecurityState(true);
      const warning = attempts >= 2 && !lockNow ? ' — repeated failures will trigger security state' : '';
      setError(`${message}${warning}`);
    } finally {
      setIsLoading(false);
    }
  };

  const eyeColor = securityState ? '#ef4444' : '#22c55e';

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-[#060812]">
      <ConstellationBackground color={eyeColor} />
      <div className="scan-line-full" />
      {securityState && <div className="absolute inset-0 bg-red-950/20 animate-pulse pointer-events-none" />}
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md"
      >
        {securityState && (
          <motion.div
            initial={{ opacity: 0, rotate: -8, scale: 0.8 }}
            animate={{ opacity: 1, rotate: -4, scale: 1 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
          >
            <div className="relative w-24 h-20 rounded-xl border-2 border-red-500 bg-black/80 shadow-[0_0_35px_rgba(239,68,68,0.45)] flex items-center justify-center">
              <div className="absolute -top-8 w-14 h-12 rounded-t-full border-2 border-red-500 border-b-0" />
              <div className="scale-[0.28] absolute inset-0 flex items-center justify-center opacity-90">
                <NeuralEye size={150} color="#ef4444" speed={2.2} />
              </div>
              <span className="relative z-10 text-[11px] font-orbitron text-red-300 tracking-[0.35em] ml-1">LOCK</span>
            </div>
          </motion.div>
        )}

        <div className={`glass-card p-10 shadow-[0_0_50px_rgba(34,197,94,0.1)] transition-all duration-500 ${
          securityState ? 'border-2 border-red-500/50 shadow-[0_0_70px_rgba(239,68,68,0.25)]' : 'border border-green-500/30'
        }`}>
          {securityState && (
            <div className="absolute inset-2 rounded-2xl border border-dashed border-red-500/50 pointer-events-none" />
          )}

          <div className="flex flex-col items-center mb-10">
            <div className={`mb-6 scale-90 ${securityState ? 'animate-pulse' : ''}`}>
              <NeuralEye size={150} color={eyeColor} speed={securityState ? 2 : 1.25} />
            </div>
            <h2 className={`text-3xl font-bold font-orbitron tracking-[0.2em] uppercase ${securityState ? 'text-red-500' : 'text-green-500 neon-text-green'}`}>
              ALL EYES X
            </h2>
            <div className={`mt-2 flex items-center gap-2 font-mono-data text-[10px] uppercase tracking-[0.4em] ${securityState ? 'text-red-400/70' : 'text-green-500/40'}`}>
              {securityState ? <AlertTriangle size={12} /> : <ShieldCheck size={12} />}
              <span>{securityState ? 'Security Lockdown State' : 'Universal Control v1.0'}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {!securityState && (
              <div className="space-y-2">
                <label className="block text-[10px] font-orbitron text-green-500/70 uppercase tracking-widest ml-1">
                  Username
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-green-500/30 group-focus-within:text-green-500 transition-colors">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/60 border border-green-500/20 rounded-xl py-3 pl-12 pr-4 text-green-400 focus:outline-none focus:border-green-500/50 transition-all font-rajdhani placeholder-green-900"
                    placeholder="admin"
                  />
                </div>
              </div>
            )}

            <div className={`space-y-2 ${securityState ? 'max-w-xs mx-auto' : ''}`}>
              <label className={`block text-[10px] font-orbitron uppercase tracking-widest ml-1 ${securityState ? 'text-red-400/80 text-center' : 'text-green-500/70'}`}>
                {securityState ? 'Recovery Phrase' : 'Password'}
              </label>
              <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${securityState ? 'text-red-400/60' : 'text-green-500/30 group-focus-within:text-green-500'}`}>
                  <Lock size={18} />
                </div>
                <input
                  type={securityState ? 'password' : (showPassword ? 'text' : 'password')}
                  required
                  value={securityState ? recoveryPhrase : password}
                  onChange={(e) => securityState ? setRecoveryPhrase(e.target.value) : setPassword(e.target.value)}
                  className={`w-full bg-black/60 rounded-xl py-3 pl-12 pr-12 focus:outline-none transition-all font-rajdhani placeholder-green-900 ${
                    securityState
                      ? 'border border-red-500/40 focus:border-red-400/70 placeholder-red-950 text-transparent caret-red-400 selection:bg-transparent'
                      : 'border border-green-500/20 focus:border-green-500/50 text-green-400'
                  }`}
                  placeholder={securityState ? 'ENTER RECOVERY PHRASE' : '••••••••'}
                  autoComplete="off"
                />
                {!securityState && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-green-500/30 hover:text-green-500 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
              </div>
              {securityState && (
                <p className="text-center text-[9px] font-mono-data text-red-400/50 uppercase tracking-widest">
                  Input is intentionally invisible. No writing is displayed.
                </p>
              )}
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`text-[10px] font-orbitron text-center uppercase tracking-tighter ${error.includes('CLEARED') ? 'text-green-400' : 'text-red-500'}`}
              >
                {error}
              </motion.p>
            )}

            {!securityState && failedAttempts > 0 && (
              <p className="text-center text-[9px] text-yellow-400/70 font-mono-data uppercase">
                Failed attempt {failedAttempts}. Security state threshold approaching.
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full relative group overflow-hidden border font-orbitron font-bold py-4 rounded-xl transition-all disabled:opacity-50 ${
                securityState
                  ? 'bg-red-600/10 border-red-500/50 hover:bg-red-600 text-red-300 hover:text-white shadow-[0_0_30px_rgba(239,68,68,0.15)]'
                  : 'bg-green-600/10 border-green-500/50 hover:bg-green-600 hover:text-white text-green-500 shadow-[0_0_30px_rgba(34,197,94,0.1)]'
              }`}
            >
              <span className="relative z-10">
                {isLoading ? 'SYNCING...' : securityState ? 'UNLOCK' : 'INITIATE CONTROL'}
              </span>
            </button>
          </form>

          <div className="mt-12 text-center">
            <p className={`text-[10px] font-orbitron uppercase tracking-widest ${securityState ? 'text-red-950' : 'text-green-900'}`}>
              Department of Black Cortex Universal Control
            </p>
          </div>
        </div>
      </motion.div>

      <div className={`fixed bottom-6 left-6 font-mono-data text-[10px] ${securityState ? 'text-red-900' : 'text-green-900'}`}>
        SESSION: {securityState ? 'LOCKED' : 'SECURE'}
      </div>
      <div className={`fixed bottom-6 right-6 font-mono-data text-[10px] ${securityState ? 'text-red-900' : 'text-green-900'}`}>
        v1.0
      </div>
    </div>
  );
};

export default Login;

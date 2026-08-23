import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, User, ShieldCheck } from 'lucide-react';
import NeuralEye from '../components/NeuralEye';
import ConstellationBackground from '../components/ConstellationBackground';

const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Admin Credentials as requested: admin / FRED123
    setTimeout(() => {
      if (username === 'admin' && password === 'FRED123') {
        onLogin();
      } else {
        setError('ACCESS DENIED: NEURAL KEY MISMATCH');
        setIsLoading(false);
      }
    }, 1200);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-[#060812]">
      <ConstellationBackground color="#22c55e" />
      <div className="scan-line-full" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-card p-10 border border-green-500/30 shadow-[0_0_50px_rgba(34,197,94,0.1)]">
          <div className="flex flex-col items-center mb-10">
            <div className="mb-6 scale-90">
              <NeuralEye size={150} color="#22c55e" />
            </div>
            <h2 className="text-3xl font-bold font-orbitron text-green-500 tracking-[0.2em] neon-text-green uppercase">
              ALL EYES X
            </h2>
            <div className="mt-2 flex items-center gap-2 text-green-500/40 font-mono-data text-[10px] uppercase tracking-[0.4em]">
              <ShieldCheck size={12} />
              <span>Universal Control v1.0</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="space-y-2">
              <label className="block text-[10px] font-orbitron text-green-500/70 uppercase tracking-widest ml-1">
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-green-500/30 group-focus-within:text-green-500 transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/60 border border-green-500/20 rounded-xl py-3 pl-12 pr-12 text-green-400 focus:outline-none focus:border-green-500/50 transition-all font-rajdhani placeholder-green-900"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-green-500/30 hover:text-green-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-red-500 text-[10px] font-orbitron text-center uppercase tracking-tighter"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full relative group overflow-hidden bg-green-600/10 border border-green-500/50 hover:bg-green-600 hover:text-white text-green-500 font-orbitron font-bold py-4 rounded-xl transition-all shadow-[0_0_30px_rgba(34,197,94,0.1)] disabled:opacity-50"
            >
              <span className="relative z-10">
                {isLoading ? 'SYNCING...' : 'INITIATE CONTROL'}
              </span>
            </button>
          </form>

          <div className="mt-12 text-center">
            <p className="text-[10px] font-orbitron text-green-900 uppercase tracking-widest">
              Department of Black Cortex Universal Control
            </p>
          </div>
        </div>
      </motion.div>

      <div className="fixed bottom-6 left-6 text-green-900 font-mono-data text-[10px]">
        ENCRYPTION: AES-512-NEURAL
      </div>
      <div className="fixed bottom-6 right-6 text-green-900 font-mono-data text-[10px]">
        v1.0
      </div>
    </div>
  );
};

export default Login;

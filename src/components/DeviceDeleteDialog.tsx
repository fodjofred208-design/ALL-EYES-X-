import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface DeviceDeleteDialogProps {
  deviceId: string;
  hostname?: string;
  deviceOs?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeviceDeleteDialog: React.FC<DeviceDeleteDialogProps> = ({
  deviceId,
  hostname = 'Unknown',
  deviceOs = '',
  onConfirm,
  onCancel,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  useEffect(() => {
    const checkPreference = async () => {
      try {
        const origin = window.location.origin;
        const res = await fetch(
          `${origin}/api/device/${deviceId}/preference?key=delete_dont_show`,
          { credentials: 'include' }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.value === 'true') {
            setDontShowAgain(true);
            setPreferenceLoaded(true);
          }
        }
      } catch {
        // preference not found — normal on first delete
      }
      setPreferenceLoaded(true);
    };
    checkPreference();
  }, [deviceId]);

  useEffect(() => {
    if (preferenceLoaded && dontShowAgain) {
      onConfirm();
    }
  }, [preferenceLoaded, dontShowAgain, onConfirm]);

  const handleConfirm = async () => {
    if (dontShowAgain) {
      try {
        const origin = window.location.origin;
        await fetch(`${origin}/api/device/${deviceId}/preference`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'delete_dont_show', value: 'true' }),
        });
      } catch {
        // silent
      }
    }
    onConfirm();
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onCancel}
        />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-sm bg-slate-900/95 border border-green-500/20 rounded-xl shadow-2xl shadow-green-900/20 overflow-hidden"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-2 flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">Remove Device</h3>
              <p className="text-sm text-slate-400 mt-1">
                Permanently delete <span className="font-medium text-green-400">{hostname}</span>?
              </p>
            </div>
          </div>

          {/* Device preview */}
          <div className="mx-6 mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{hostname}</p>
              <p className="text-xs text-slate-600 font-mono truncate">{deviceId}</p>
            </div>
          </div>

          {/* Warning */}
          <div className="px-6 py-3">
            <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-400/5 rounded-lg p-2.5 border border-amber-400/10">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>This action cannot be undone. The agent will re-register on next heartbeat if still running.</span>
            </div>
          </div>

          {/* Don't show again */}
          <div className="px-6 py-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <div className="relative w-4 h-4 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded border transition-all ${
                  dontShowAgain
                    ? 'bg-green-500 border-green-400'
                    : 'bg-slate-800 border-slate-600 group-hover:border-green-500/50'
                } flex items-center justify-center`}>
                  {dontShowAgain && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                Don't show this again for this device
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 flex justify-end gap-2.5 border-t border-slate-700/30 mt-4">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700/30"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors"
            >
              Delete Device
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default DeviceDeleteDialog;
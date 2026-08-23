import React, { useState } from 'react';
import axios from 'axios';
import CyberEye from '../components/CyberEye';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackType, setFeedbackType] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFeedback('Authenticating...');
    setFeedbackType('');

    try {
      const res = await axios.post("http://localhost:5000/api/auth/login", { username, password }, { withCredentials: true });
      if (res.data.success) {
        setFeedback('Identity Verified');
        setFeedbackType('success');
        setTimeout(() => onLogin(), 800);
      }
    } catch (err) {
      setFeedback('Authentication Failed');
      setFeedbackType('error');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <canvas id="constellation-bg" className="constellation-bg" />
      
      <div className="login-card">
        <div className="login-header">
          <CyberEye size={140} />
          <h1 className="login-title">ALL EYES X</h1>
          <p className="login-subtitle">Department of Black Cortex Universal Control</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">USERNAME</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter credentials..."
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">PASSWORD</label>
            <div className="password-wrapper">
              <input
                type={showPw ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter credentials..."
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" className="toggle-pw" onClick={() => setShowPw(!showPw)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPw ? (
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  ) : (
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  )}
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'AUTHENTICATING...' : 'SECURE LOGIN'}
          </button>

          {feedback && (
            <p className={`login-feedback ${feedbackType}`}>
              {feedback}
            </p>
          )}
        </form>
      </div>

      <style>{`
        .login-page {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--black-gradient);
          position: relative;
          overflow: hidden;
        }
        .login-card {
          background: rgba(10, 14, 26, 0.75);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(0, 212, 255, 0.15);
          border-radius: 16px;
          padding: 40px 32px;
          width: min(380px, 90%);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 20px rgba(0,255,136,0.05);
          z-index: 2;
        }
        .login-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 32px;
        }
        .login-title {
          font-family: var(--font-orbitron);
          font-size: 2rem;
          color: var(--neon-green);
          text-shadow: 0 0 20px rgba(0,255,136,0.3);
          margin-top: 8px;
        }
        .login-subtitle {
          font-family: var(--font-rajdhani);
          font-size: 0.7rem;
          color: var(--text-muted);
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-top: 4px;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-label {
          font-family: var(--font-rajdhani);
          font-size: 0.75rem;
          color: var(--text-muted);
          letter-spacing: 2px;
        }
        .form-input {
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(0,255,136,0.3);
          border-radius: 8px;
          padding: 12px 16px;
          font-size: 1rem;
          color: var(--neon-green);
          font-family: var(--font-rajdhani);
          transition: all 0.2s;
        }
        .form-input:focus {
          border-color: var(--neon-green);
          box-shadow: 0 0 12px rgba(0,255,136,0.15);
        }
        .form-input::placeholder {
          color: rgba(100, 116, 139, 0.5);
        }
        .password-wrapper {
          position: relative;
        }
        .password-wrapper .form-input {
          width: 100%;
          padding-right: 44px;
        }
        .toggle-pw {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
        }
        .toggle-pw:hover { color: var(--neon-green); }
        .login-btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, var(--emerald), var(--neon-green));
          border: none;
          border-radius: 8px;
          color: #000;
          font-family: var(--font-orbitron);
          font-size: 0.9rem;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: 600;
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0,255,136,0.3);
        }
        .login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .login-feedback {
          text-align: center;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          padding: 8px;
          border-radius: 6px;
        }
        .login-feedback.success {
          color: var(--neon-green);
          text-shadow: 0 0 8px rgba(0,255,136,0.3);
        }
        .login-feedback.error {
          color: var(--error);
          text-shadow: 0 0 8px rgba(239,68,68,0.3);
        }
      `}</style>
    </div>
  );
}
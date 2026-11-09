import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [step, setStep] = useState('id'); // id | password | setup
  const [username, setUsername] = useState('');
  const [account, setAccount] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const checkId = (e) => {
    e.preventDefault();
    run(async () => {
      const a = await api.post('/auth/check', { username });
      setAccount(a);
      setStep(a.needs_password ? 'setup' : 'password');
    });
  };
  const signIn = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api.post('/auth/login', { username: account.username, password });
      onLogin(r.token, r.user);
    });
  };
  const setup = (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('Passwords do not match');
    run(async () => {
      const r = await api.post('/auth/setup', { username: account.username, password });
      onLogin(r.token, r.user);
    });
  };
  const back = () => { setStep('id'); setPassword(''); setConfirm(''); setError(''); };

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="brand">
          <div className="logo">TM</div>
          <h1>Task Manager CEO</h1>
          <p className="sub">
            {step === 'id' && 'Sign in with the user ID your admin gave you.'}
            {step === 'password' && `Welcome back, ${account?.display_name}.`}
            {step === 'setup' && 'First time here — create your password.'}
          </p>
        </div>

        {step === 'id' && (
          <form onSubmit={checkId}>
            <div className="field">
              <label>User ID</label>
              <input className="input" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. KaranGill" />
            </div>
            {error && <div className="err">{error}</div>}
            <button className="btn primary" disabled={!username.trim() || busy}>Continue</button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={signIn}>
            <button type="button" className="back" onClick={back}><ArrowLeft size={14} /> {account.username}</button>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="err">{error}</div>}
            <button className="btn primary" disabled={!password || busy}>Sign in</button>
            <p className="faint small" style={{ textAlign: 'center', marginTop: 14 }}>Forgot your password? Ask an admin to reset it.</p>
          </form>
        )}

        {step === 'setup' && (
          <form onSubmit={setup}>
            <button type="button" className="back" onClick={back}><ArrowLeft size={14} /> {account.username}</button>
            <div className="welcome">👋 Hi {account.display_name}! Set a password you'll use to sign in from now on.</div>
            <div className="field">
              <label>New password</label>
              <input className="input" type="password" autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="hint">At least 8 characters</span>
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <div className="err">{error}</div>}
            <button className="btn primary" disabled={!password || !confirm || busy}>Create password & sign in</button>
          </form>
        )}
      </div>
    </div>
  );
}

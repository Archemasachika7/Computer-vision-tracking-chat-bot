'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName]   = useState('');
  const [email,    setEmail]      = useState('');
  const [password, setPassword]   = useState('');
  const [confirm,  setConfirm]    = useState('');
  const [error,    setError]      = useState<string | null>(null);
  const [loading,  setLoading]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return; }

    // Create profile row
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        role: 'user',
      });
    }

    setLoading(false);
    router.push('/');
  };

  return (
    <main className="auth-shell">
      <div className="orb orb-cyan" aria-hidden />
      <div className="orb orb-purple" aria-hidden />

      <div className="auth-card">
        <div className="auth-logo">🎯 ProctorAI</div>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-sub">Join ProctorAI today</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Full Name
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="auth-input" placeholder="Jane Smith" required />
          </label>
          <label className="auth-label">
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="auth-input" placeholder="you@example.com" required />
          </label>
          <label className="auth-label">
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="auth-input" placeholder="Min. 6 characters" required />
          </label>
          <label className="auth-label">
            Confirm Password
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="auth-input" placeholder="Re-enter password" required />
          </label>
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link href="/auth/login" className="auth-link">Sign in</Link>
        </p>
      </div>
    </main>
  );
}

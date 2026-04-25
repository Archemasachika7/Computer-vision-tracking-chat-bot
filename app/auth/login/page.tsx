'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    router.push('/');
  };

  return (
    <main className="auth-shell">
      <div className="orb orb-cyan" aria-hidden />
      <div className="orb orb-purple" aria-hidden />

      <div className="auth-card">
        <div className="auth-logo">🎯 ProctorAI</div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Continue to your account</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="auth-label">
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="auth-input" placeholder="you@example.com" required />
          </label>
          <label className="auth-label">
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="auth-input" placeholder="••••••••" required />
          </label>
          <button type="submit" disabled={loading} className="auth-btn">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="auth-link">Create one</Link>
        </p>
      </div>
    </main>
  );
}

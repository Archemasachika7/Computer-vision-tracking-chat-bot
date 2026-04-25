'use client';

import Link from 'next/link';
import { useAuth } from './components/AuthProvider';

export default function LandingPage() {
  const { user, isAdmin, loading } = useAuth();

  return (
    <main className="landing-shell">
      <div className="orb orb-cyan" aria-hidden />
      <div className="orb orb-purple" aria-hidden />

      {/* ── Hero ── */}
      <section className="hero-section">
        <span className="hero-badge">AI-Powered Proctoring</span>
        <h1 className="hero-title">
          Smarter Exams.<br />Trusted Results.
        </h1>
        <p className="hero-sub">
          Real-time iris tracking and computer vision keep your assessments honest —
          no plugins, no downloads.
        </p>
        <div className="hero-actions">
          <Link href="/quiz/join" className="hero-cta">Join a Quiz →</Link>
          {!loading && !user && (
            <Link href="/auth/register" className="hero-secondary">Create Account</Link>
          )}
          {!loading && isAdmin && (
            <Link href="/admin" className="hero-secondary">Admin Dashboard</Link>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features-grid">
        {[
          {
            icon: '👁️',
            title: 'Iris Eye Tracking',
            desc: 'MediaPipe 478-point model detects exact gaze direction frame-by-frame using your iris position.',
          },
          {
            icon: '🖥️',
            title: 'Screen Monitoring',
            desc: 'Full-monitor screen share enforced — switching tabs or windows triggers instant violation alerts.',
          },
          {
            icon: '✅',
            title: 'Per-Question Feedback',
            desc: 'Check each answer immediately as you go, or submit everything at the end for a final score.',
          },
          {
            icon: '📡',
            title: 'Live Admin View',
            desc: 'Admins see who is actively in a quiz, track live violations, and manage sessions in real time.',
          },
        ].map(f => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3 className="feature-title">{f.title}</h3>
            <p className="feature-desc">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── Bottom CTA ── */}
      <div className="landing-bottom-cta">
        <p className="landing-cta-label">Got a Quiz ID?</p>
        <Link href="/quiz/join" className="hero-cta">Enter Quiz Room →</Link>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, type Quiz, type Profile } from '@/lib/supabase';
import { useAuth } from '../components/AuthProvider';

interface LiveSession {
  id: string;
  quiz_id: string;
  user_id: string;
  started_at: string;
  quizTitle: string;
  userName: string;
}

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [quizzes,  setQuizzes]  = useState<Quiz[]>([]);
  const [users,    setUsers]    = useState<Profile[]>([]);
  const [live,     setLive]     = useState<LiveSession[]>([]);
  const [tab,      setTab]      = useState<'live' | 'quizzes' | 'users'>('live');
  const [busy,     setBusy]     = useState(false);

  useEffect(() => {
    if (!loading && !user)    router.push('/auth/login');
    if (!loading && !isAdmin) router.push('/');
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('quizzes').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setQuizzes(data ?? []));
    supabase.from('profiles').select('*').order('created_at')
      .then(({ data }) => setUsers(data ?? []));
    fetchLive();
  }, [isAdmin]);

  const fetchLive = async () => {
    // In-progress attempts: score IS NULL, started in the last 6 hours
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: attempts } = await supabase
      .from('quiz_attempts')
      .select('id, quiz_id, user_id, started_at')
      .is('score', null)
      .not('started_at', 'is', null)
      .gte('started_at', cutoff)
      .order('started_at', { ascending: false });

    if (!attempts || attempts.length === 0) { setLive([]); return; }

    // Fetch quiz titles and user names separately
    const quizIds  = [...new Set(attempts.map((a: {quiz_id: string}) => a.quiz_id))];
    const userIds  = [...new Set(attempts.map((a: {user_id: string}) => a.user_id))];

    const [{ data: quizData }, { data: profileData }] = await Promise.all([
      supabase.from('quizzes').select('id, title').in('id', quizIds),
      supabase.from('profiles').select('id, full_name, username').in('id', userIds),
    ]);

    const quizMap    = Object.fromEntries((quizData ?? []).map((q: {id: string; title: string}) => [q.id, q.title]));
    const profileMap = Object.fromEntries((profileData ?? []).map((p: {id: string; full_name: string | null; username: string | null}) => [p.id, p.full_name ?? p.username ?? 'Unknown']));

    setLive(attempts.map((a: {id: string; quiz_id: string; user_id: string; started_at: string}) => ({
      id:         a.id,
      quiz_id:    a.quiz_id,
      user_id:    a.user_id,
      started_at: a.started_at,
      quizTitle:  quizMap[a.quiz_id]  ?? 'Unknown Quiz',
      userName:   profileMap[a.user_id] ?? 'Unknown User',
    })));
  };

  const togglePublish = async (q: Quiz) => {
    await supabase.from('quizzes').update({ is_published: !q.is_published }).eq('id', q.id);
    setQuizzes(prev => prev.map(x => x.id === q.id ? { ...x, is_published: !q.is_published } : x));
  };

  const deleteQuiz = async (id: string) => {
    if (!confirm('Delete this quiz? This cannot be undone.')) return;
    await supabase.from('quizzes').delete().eq('id', id);
    setQuizzes(prev => prev.filter(q => q.id !== id));
  };

  const toggleRole = async (p: Profile) => {
    const newRole = p.role === 'admin' ? 'user' : 'admin';
    setBusy(true);
    await supabase.from('profiles').update({ role: newRole }).eq('id', p.id);
    setUsers(prev => prev.map(u => u.id === p.id ? { ...u, role: newRole } : u));
    setBusy(false);
  };

  const elapsed = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return mins < 1 ? 'just now' : `${mins}m ago`;
  };

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!isAdmin) return null;

  return (
    <main className="admin-shell">
      <div className="admin-header">
        <h1 className="admin-title">⚙️ Admin Dashboard</h1>
        <Link href="/admin/quiz/create" className="admin-create-btn">+ Create Quiz</Link>
      </div>

      {/* Stats */}
      <div className="admin-stats">
        <div className="stat-card">
          <div className="stat-num live-pulse">{live.length}</div>
          <div className="stat-label">Live Now</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{quizzes.length}</div>
          <div className="stat-label">Total Quizzes</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{quizzes.filter(q => q.is_published).length}</div>
          <div className="stat-label">Published</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{users.length}</div>
          <div className="stat-label">Users</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'live' ? 'admin-tab-active' : ''}`} onClick={() => { setTab('live'); fetchLive(); }}>
          <span className="live-dot" /> Live Sessions {live.length > 0 && <span className="live-count-badge">{live.length}</span>}
        </button>
        <button className={`admin-tab ${tab === 'quizzes' ? 'admin-tab-active' : ''}`} onClick={() => setTab('quizzes')}>
          📝 Quizzes
        </button>
        <button className={`admin-tab ${tab === 'users' ? 'admin-tab-active' : ''}`} onClick={() => setTab('users')}>
          👥 Users
        </button>
      </div>

      {/* Live Sessions */}
      {tab === 'live' && (
        <div className="admin-table-wrap">
          <div className="live-refresh-row">
            <span className="live-hint">Shows participants currently in a quiz (submitted within last 6 h excluded)</span>
            <button className="action-btn action-publish" onClick={fetchLive}>↻ Refresh</button>
          </div>
          {live.length === 0 ? (
            <div className="admin-empty">No active quiz sessions right now.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Participant</th>
                  <th>Started</th>
                  <th>Time in Quiz</th>
                </tr>
              </thead>
              <tbody>
                {live.map(s => (
                  <tr key={s.id}>
                    <td className="td-title">{s.quizTitle}</td>
                    <td>{s.userName}</td>
                    <td>{new Date(s.started_at).toLocaleTimeString()}</td>
                    <td>
                      <span className="live-session-badge">{elapsed(s.started_at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Quizzes table */}
      {tab === 'quizzes' && (
        <div className="admin-table-wrap">
          {quizzes.length === 0 ? (
            <div className="admin-empty">No quizzes yet. <Link href="/admin/quiz/create" className="auth-link">Create one →</Link></div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th><th>Category</th><th>Duration</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map(q => (
                  <tr key={q.id}>
                    <td className="td-title">
                      {q.title}
                      <div className="td-quiz-id">{q.id}</div>
                    </td>
                    <td><span className="category-chip">{q.category ?? '—'}</span></td>
                    <td>{q.duration_minutes} min</td>
                    <td>
                      <span className={`status-chip ${q.is_published ? 'chip-published' : 'chip-draft'}`}>
                        {q.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="td-actions">
                      <button className="action-btn action-publish" onClick={() => togglePublish(q)}>
                        {q.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <Link href={`/admin/quiz/${q.id}`} className="action-btn action-edit">Edit</Link>
                      <button className="action-btn action-delete" onClick={() => deleteQuiz(q.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Users table */}
      {tab === 'users' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th><th>Username</th><th>Role</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.full_name ?? '—'}</td>
                  <td className="td-email">{u.username ?? '—'}</td>
                  <td><span className={`status-chip ${u.role === 'admin' ? 'chip-admin' : 'chip-user'}`}>{u.role}</span></td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className={`action-btn ${u.role === 'admin' ? 'action-delete' : 'action-publish'}`}
                      onClick={() => toggleRole(u)}
                      disabled={busy}
                    >
                      {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, type Quiz, type Profile } from '@/lib/supabase';
import { useAuth } from '../components/AuthProvider';

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [users,   setUsers]   = useState<Profile[]>([]);
  const [tab,     setTab]     = useState<'quizzes' | 'users'>('quizzes');
  const [busy,    setBusy]    = useState(false);

  useEffect(() => {
    if (!loading && !user)    router.push('/auth/login');
    if (!loading && !isAdmin) router.push('/');
  }, [user, isAdmin, loading, router]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('quizzes').select('*').order('created_at', { ascending: false }).then(({ data }) => setQuizzes(data ?? []));
    supabase.from('profiles').select('*').order('created_at').then(({ data }) => setUsers(data ?? []));
  }, [isAdmin]);

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
        <div className="stat-card">
          <div className="stat-num">{users.filter(u => u.role === 'admin').length}</div>
          <div className="stat-label">Admins</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'quizzes' ? 'admin-tab-active' : ''}`} onClick={() => setTab('quizzes')}>
          📝 Quizzes
        </button>
        <button className={`admin-tab ${tab === 'users' ? 'admin-tab-active' : ''}`} onClick={() => setTab('users')}>
          👥 Users
        </button>
      </div>

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
                    <td className="td-title">{q.title}</td>
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
                <th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th>
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

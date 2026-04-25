'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, type Quiz } from '@/lib/supabase';
import { useAuth } from '../../components/AuthProvider';

export default function JoinQuizPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [quizId,    setQuizId]    = useState('');
  const [preview,   setPreview]   = useState<Quiz | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound,  setNotFound]  = useState(false);
  const [quizzes,   setQuizzes]   = useState<Quiz[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login');
  }, [user, loading, router]);

  // Load available published quizzes
  useEffect(() => {
    supabase
      .from('quizzes')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => setQuizzes(data ?? []));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = quizId.trim();
    if (!id) return;
    setSearching(true);
    setNotFound(false);
    setPreview(null);

    const { data } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', id)
      .eq('is_published', true)
      .single();

    setSearching(false);
    if (data) setPreview(data);
    else setNotFound(true);
  };

  const joinQuiz = (id: string) => router.push(`/quiz/${id}`);

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <main className="join-shell">
      <div className="orb orb-cyan" aria-hidden />
      <div className="orb orb-purple" aria-hidden />

      {/* ── Join card ── */}
      <div className="join-card">
        <div className="join-logo">🎯</div>
        <h1 className="join-title">Join a Quiz</h1>
        <p className="join-sub">Enter a Quiz ID to get started</p>

        <form onSubmit={handleSearch} className="join-form">
          <input
            className="join-input"
            placeholder="Paste Quiz ID here…"
            value={quizId}
            onChange={e => { setQuizId(e.target.value); setPreview(null); setNotFound(false); }}
            spellCheck={false}
          />
          <button type="submit" className="join-search-btn" disabled={searching}>
            {searching ? 'Searching…' : 'Find Quiz'}
          </button>
        </form>

        {notFound && (
          <div className="join-not-found">
            No published quiz found with that ID. Check the ID and try again.
          </div>
        )}

        {/* Quiz preview */}
        {preview && (
          <div className="join-preview">
            <div className="join-preview-cat">{preview.category ?? 'Quiz'}</div>
            <h2 className="join-preview-title">{preview.title}</h2>
            {preview.description && <p className="join-preview-desc">{preview.description}</p>}
            <div className="join-preview-meta">
              <span>⏱ {preview.duration_minutes} min</span>
              <span>👁️ Camera monitored</span>
            </div>
            <button className="join-enter-btn" onClick={() => joinQuiz(preview.id)}>
              Enter Quiz Room →
            </button>
          </div>
        )}
      </div>

      {/* ── Browse available quizzes ── */}
      {quizzes.length > 0 && (
        <div className="join-browse">
          <h2 className="join-browse-title">Available Quizzes</h2>
          <div className="join-quiz-list">
            {quizzes.map(q => (
              <div key={q.id} className="join-quiz-row">
                <div className="join-quiz-info">
                  {q.category && <span className="join-quiz-cat">{q.category}</span>}
                  <span className="join-quiz-name">{q.title}</span>
                  <span className="join-quiz-dur">⏱ {q.duration_minutes} min</span>
                </div>
                <button className="join-quiz-btn" onClick={() => joinQuiz(q.id)}>
                  Join →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

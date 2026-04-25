'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, type Quiz } from '@/lib/supabase';
import { useAuth } from '../components/AuthProvider';

export default function QuizListPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login');
  }, [user, loading, router]);

  useEffect(() => {
    supabase.from('quizzes').select('*').eq('is_published', true).order('created_at', { ascending: false })
      .then(({ data }) => setQuizzes(data ?? []));
  }, []);

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <main className="quiz-list-shell">
      <div className="quiz-list-header">
        <h1 className="quiz-list-title">Available Quizzes</h1>
        <p className="quiz-list-sub">Select a quiz to begin. Your camera will be monitored.</p>
      </div>

      {quizzes.length === 0 ? (
        <div className="quiz-empty">No published quizzes yet. Check back later!</div>
      ) : (
        <div className="quiz-grid">
          {quizzes.map(q => (
            <div key={q.id} className="quiz-card">
              <div className="quiz-card-cat">{q.category ?? 'General'}</div>
              <h2 className="quiz-card-title">{q.title}</h2>
              <p className="quiz-card-desc">{q.description ?? 'No description provided.'}</p>
              <div className="quiz-card-meta">
                <span>⏱ {q.duration_minutes} min</span>
                <span>📅 {new Date(q.created_at).toLocaleDateString()}</span>
              </div>
              <Link href={`/quiz/${q.id}`} className="quiz-start-btn">Start Quiz →</Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase, type Quiz, type QuizQuestion, type QuizOption } from '@/lib/supabase';
import { useAuth } from '../../components/AuthProvider';
import EyeTracker, { type ProctoringViolation } from '../../components/EyeTracker';
import ChatWidget from '../../components/ChatWidget';

interface QuestionWithOptions extends QuizQuestion {
  options: QuizOption[];
}

export default function TakeQuizPage() {
  const { user, loading } = useAuth();
  const router   = useParams();
  const nav      = useRouter();
  const quizId   = router.id as string;

  const [quiz,      setQuiz]      = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionWithOptions[]>([]);
  const [answers,   setAnswers]   = useState<Record<string, string | string[]>>({});
  const [timeLeft,  setTimeLeft]  = useState(0);
  const [started,   setStarted]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [score,     setScore]     = useState<{ earned: number; total: number } | null>(null);
  const [violations, setViolations] = useState<ProctoringViolation[]>([]);
  const [activeAlert, setActiveAlert] = useState<ProctoringViolation | null>(null);
  const alertRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !user) nav.push('/auth/login');
  }, [user, loading, nav]);

  useEffect(() => {
    if (!quizId) return;
    supabase.from('quizzes').select('*').eq('id', quizId).single()
      .then(({ data }) => {
        if (!data) { nav.push('/quiz'); return; }
        setQuiz(data);
        setTimeLeft(data.duration_minutes * 60);
      });

    supabase.from('quiz_questions').select('*, quiz_options(*)').eq('quiz_id', quizId)
      .order('order_index')
      .then(({ data }) => setQuestions((data ?? []) as QuestionWithOptions[]));
  }, [quizId, nav]);

  // Countdown
  useEffect(() => {
    if (!started || submitted || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(s => {
      if (s <= 1) { handleSubmit(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, submitted]);

  const addViolation = useCallback((v: ProctoringViolation) => {
    setViolations(prev => [...prev, v]);
    if (alertRef.current) clearTimeout(alertRef.current);
    setActiveAlert(v);
    alertRef.current = setTimeout(() => setActiveAlert(null), 4000);
  }, []);

  const handleAnswer = (qid: string, val: string, type: string, checked?: boolean) => {
    if (type === 'msq') {
      setAnswers(prev => {
        const cur = (prev[qid] as string[] | undefined) ?? [];
        return { ...prev, [qid]: checked ? [...cur, val] : cur.filter(v => v !== val) };
      });
    } else {
      setAnswers(prev => ({ ...prev, [qid]: val }));
    }
  };

  const handleSubmit = async () => {
    if (submitted || !quiz || !user) return;
    setSubmitted(true);

    let earned = 0, total = 0;
    const attempt_id = crypto.randomUUID();

    const { data: attempt } = await supabase.from('quiz_attempts').insert({
      id: attempt_id, quiz_id: quiz.id, user_id: user.id,
      submitted_at: new Date().toISOString(),
    }).select().single();

    for (const q of questions) {
      total += q.points;
      const userAns = answers[q.id];
      let correct = false;

      if (q.type === 'integer') {
        correct = String(userAns ?? '').trim() === (q.correct_answer ?? '').trim();
      } else if (q.type === 'msq') {
        const correctSet = JSON.parse(q.correct_answer ?? '[]') as string[];
        const userSet    = (userAns as string[] | undefined) ?? [];
        correct = correctSet.length === userSet.length && correctSet.every(v => userSet.includes(v));
      } else {
        correct = userAns === q.correct_answer;
      }

      if (correct) earned += q.points;

      if (attempt) {
        await supabase.from('quiz_responses').insert({
          attempt_id: attempt.id, question_id: q.id,
          answer: JSON.stringify(userAns), is_correct: correct,
          points_earned: correct ? q.points : 0,
        });
      }
    }

    if (attempt) {
      await supabase.from('quiz_attempts').update({ score: earned, total_points: total }).eq('id', attempt.id);
    }

    setScore({ earned, total });
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (loading || !quiz) return <div className="page-loading">Loading quiz…</div>;

  /* ── Result screen ── */
  if (submitted && score) return (
    <main className="quiz-result-shell">
      <div className="quiz-result-card">
        <div className="result-icon">{score.earned >= score.total * 0.7 ? '🏆' : '📊'}</div>
        <h1 className="result-title">Quiz Complete!</h1>
        <p className="result-quiz-name">{quiz.title}</p>
        <div className="result-score">
          <span className="result-score-num">{score.earned}</span>
          <span className="result-score-sep">/</span>
          <span className="result-score-total">{score.total}</span>
        </div>
        <p className="result-pct">{Math.round((score.earned / score.total) * 100)}% correct</p>
        {violations.length > 0 && (
          <p className="result-violations">⚠️ {violations.length} proctoring violation{violations.length > 1 ? 's' : ''} recorded</p>
        )}
        <button className="auth-btn" style={{ marginTop: '1.5rem' }} onClick={() => nav.push('/quiz')}>
          Back to Quizzes
        </button>
      </div>
    </main>
  );

  /* ── Start screen ── */
  if (!started) return (
    <main className="start-shell">
      <div className="orb orb-cyan" aria-hidden />
      <div className="orb orb-purple" aria-hidden />
      <div className="start-card">
        <div className="start-badge">{quiz.category ?? 'Quiz'}</div>
        <h1 className="start-title">{quiz.title}</h1>
        <p className="start-desc">{quiz.description ?? 'Answer all questions carefully.'}</p>
        <div className="start-meta">
          <span>⏱ <strong>{quiz.duration_minutes} minutes</strong></span>
          <span>📝 <strong>{questions.length} questions</strong></span>
          <span>👁️ Camera monitored</span>
        </div>
        <button className="start-btn" onClick={() => setStarted(true)}>Start Quiz →</button>
      </div>
    </main>
  );

  /* ── Quiz screen (same proctor layout as exam) ── */
  return (
    <main className="proctor-shell">
      {/* Top bar */}
      <header className="proctor-topbar">
        <div className="topbar-left">
          <span className="topbar-logo">📝 {quiz.title}</span>
          <span className="topbar-live">● LIVE</span>
        </div>
        <div className="topbar-right">
          {violations.length > 0 && (
            <span className="viol-crit-badge">{violations.length} ⚠️</span>
          )}
          <div className={`topbar-timer ${timeLeft < 120 ? 'timer-urgent' : ''}`}>{fmt(timeLeft)}</div>
        </div>
      </header>

      {activeAlert && (
        <div className={`proctor-alert ${activeAlert.severity === 'critical' ? 'alert-critical' : 'alert-warning'}`}>
          <span className="alert-icon">{activeAlert.severity === 'critical' ? '🚨' : '⚠️'}</span>
          <strong>{activeAlert.label}</strong>
        </div>
      )}

      <div className="proctor-top-row">
        <div className="proctor-cam-col">
          <EyeTracker onViolation={addViolation} onScreenShareStatus={() => {}} active={started} />
        </div>
        <div className="proctor-viol-col">
          <div className="viol-log">
            <div className="viol-log-header">Violations <span className="viol-log-count">{violations.length}</span></div>
            <div className="viol-log-list">
              {violations.length === 0
                ? <div className="viol-empty">Clean so far</div>
                : [...violations].reverse().map(v => (
                    <div key={v.id} className={`viol-entry viol-entry-${v.severity}`}>
                      <span>{v.severity === 'critical' ? '🚨' : '⚠️'}</span>
                      <div className="viol-entry-info">
                        <span className="viol-entry-label">{v.label}</span>
                        <span className="viol-entry-time">{v.timestamp.toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      </div>

      <div className="exam-area">
        <div className="exam-questions">
          {questions.map((q, qi) => (
            <div key={q.id} className="exam-q">
              <p className="exam-q-text">
                <strong className="exam-q-num">Q{qi + 1}.</strong> {q.question_text}
                <span className="exam-q-pts">[{q.points} pts] <em className="q-type-tag">{q.type.toUpperCase()}</em></span>
              </p>

              {q.type === 'integer' && (
                <input type="number" className="auth-input" style={{ maxWidth: '200px' }}
                  placeholder="Your answer"
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => handleAnswer(q.id, e.target.value, 'integer')} />
              )}

              {(q.type === 'mcq' || q.type === 'msq') && (
                <div className="exam-q-options">
                  {q.options.sort((a, b) => a.order_index - b.order_index).map((opt, oi) => {
                    const sel = q.type === 'mcq'
                      ? answers[q.id] === opt.option_text
                      : ((answers[q.id] as string[] | undefined) ?? []).includes(opt.option_text);
                    return (
                      <label key={opt.id} className={`exam-option ${sel ? 'exam-option-selected' : ''}`}>
                        <input
                          type={q.type === 'mcq' ? 'radio' : 'checkbox'}
                          name={`q-${q.id}`}
                          checked={sel}
                          onChange={e => handleAnswer(q.id, opt.option_text, q.type, e.target.checked)}
                          className="exam-radio"
                        />
                        <span className="exam-option-letter">{String.fromCharCode(65 + oi)}.</span>
                        <span>{opt.option_text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="exam-submit-row">
          <button className="exam-submit-btn" onClick={() => { if (confirm('Submit the quiz?')) handleSubmit(); }}>
            Submit Quiz
          </button>
          <span className="exam-submit-note">
            {Object.keys(answers).length} / {questions.length} answered
          </span>
        </div>
      </div>

      <ChatWidget />
    </main>
  );
}

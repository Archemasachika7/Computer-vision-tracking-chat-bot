'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, type QuestionType } from '@/lib/supabase';
import { useAuth } from '../../../components/AuthProvider';

/* ── Local types ─────────────────────────────────────────────────────── */
interface LocalOption { id: string; text: string; is_correct: boolean }
interface LocalQuestion {
  id: string; type: QuestionType; text: string; points: number;
  options: LocalOption[]; integer_answer: string;
}
interface QuizMeta { title: string; description: string; category: string; duration_minutes: number }

const uid = () => Math.random().toString(36).slice(2);

const blankQuestion = (): LocalQuestion => ({
  id: uid(), type: 'mcq', text: '', points: 5, integer_answer: '',
  options: [
    { id: uid(), text: '', is_correct: false },
    { id: uid(), text: '', is_correct: false },
    { id: uid(), text: '', is_correct: false },
    { id: uid(), text: '', is_correct: false },
  ],
});

/* ── Component ───────────────────────────────────────────────────────── */
export default function CreateQuizPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [mode,      setMode]      = useState<'build' | 'upload'>('build');
  const [meta,      setMeta]      = useState<QuizMeta>({ title: '', description: '', category: '', duration_minutes: 30 });
  const [questions, setQuestions] = useState<LocalQuestion[]>([blankQuestion()]);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Upload mode
  const [uploadedQuestions, setUploadedQuestions] = useState<LocalQuestion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user)    router.push('/auth/login');
    if (!loading && !isAdmin) router.push('/');
  }, [user, isAdmin, loading, router]);

  /* ── Question helpers ── */
  const updateQ = (id: string, patch: Partial<LocalQuestion>) =>
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));

  const updateOpt = (qid: string, oid: string, patch: Partial<LocalOption>) =>
    setQuestions(prev => prev.map(q => q.id !== qid ? q : {
      ...q,
      options: q.options.map(o => o.id === oid ? { ...o, ...patch } : o),
    }));

  const setCorrectSingle = (qid: string, oid: string) =>
    setQuestions(prev => prev.map(q => q.id !== qid ? q : {
      ...q,
      options: q.options.map(o => ({ ...o, is_correct: o.id === oid })),
    }));

  const addOption = (qid: string) =>
    setQuestions(prev => prev.map(q => q.id !== qid ? q : {
      ...q, options: [...q.options, { id: uid(), text: '', is_correct: false }],
    }));

  const removeOption = (qid: string, oid: string) =>
    setQuestions(prev => prev.map(q => q.id !== qid ? q : {
      ...q, options: q.options.filter(o => o.id !== oid),
    }));

  /* ── File upload & parse ── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    const res  = await fetch('/api/admin/upload-quiz', { method: 'POST', body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) { setError(data.error); return; }
    if (data.meta) setMeta(m => ({ ...m, ...data.meta }));
    const parsed: LocalQuestion[] = (data.questions as any[]).map(q => ({
      id: uid(), type: q.type, text: q.text, points: q.points,
      integer_answer: q.integer_answer ?? '',
      options: (q.options ?? []).map((o: any) => ({ id: uid(), text: o.text, is_correct: o.is_correct })),
    }));
    setUploadedQuestions(parsed);
    setUploadPreview(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const confirmUpload = () => {
    setQuestions(uploadedQuestions);
    setMode('build');
    setUploadPreview(false);
  };

  /* ── Save quiz to Supabase ── */
  const handleSave = async (publish = false) => {
    if (!user) return;
    if (!meta.title.trim()) { setError('Quiz title is required.'); return; }

    const qs = mode === 'upload' && uploadPreview ? uploadedQuestions : questions;

    for (const q of qs) {
      if (!q.text.trim()) { setError('All questions must have text.'); return; }
      if (q.type !== 'integer' && !q.options.some(o => o.is_correct)) {
        setError(`Question "${q.text.slice(0, 40)}…" has no correct answer selected.`); return;
      }
      if (q.type === 'integer' && !q.integer_answer.trim()) {
        setError(`Integer question "${q.text.slice(0, 40)}…" needs an answer.`); return;
      }
    }

    setSaving(true); setError(null);
    const { data: quiz, error: qErr } = await supabase
      .from('quizzes')
      .insert({ ...meta, created_by: user.id, is_published: publish })
      .select()
      .single();

    if (qErr || !quiz) { setError(qErr?.message ?? 'Failed to save quiz.'); setSaving(false); return; }

    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      const correctAnswer = q.type === 'integer'
        ? q.integer_answer
        : q.type === 'msq'
          ? JSON.stringify(q.options.filter(o => o.is_correct).map(o => o.text))
          : q.options.find(o => o.is_correct)?.text ?? '';

      const { data: savedQ } = await supabase
        .from('quiz_questions')
        .insert({ quiz_id: quiz.id, question_text: q.text, type: q.type, points: q.points, order_index: i, correct_answer: correctAnswer })
        .select()
        .single();

      if (savedQ && q.type !== 'integer') {
        await supabase.from('quiz_options').insert(
          q.options.map((o, oi) => ({ question_id: savedQ.id, option_text: o.text, is_correct: o.is_correct, order_index: oi }))
        );
      }
    }

    setSaving(false);
    router.push('/admin');
  };

  if (loading || !isAdmin) return <div className="page-loading">Loading…</div>;

  return (
    <main className="create-shell">
      <div className="create-header">
        <h1 className="create-title">Create Quiz</h1>
        <div className="create-tabs">
          <button className={`ctab ${mode === 'build' ? 'ctab-active' : ''}`} onClick={() => setMode('build')}>🛠 Build</button>
          <button className={`ctab ${mode === 'upload' ? 'ctab-active' : ''}`} onClick={() => setMode('upload')}>📁 Upload File</button>
        </div>
      </div>

      {error && <div className="create-error">{error}</div>}

      {/* ── Quiz metadata ── */}
      <section className="create-section">
        <h2 className="create-section-title">Quiz Details</h2>
        <div className="create-meta-grid">
          <label className="auth-label" style={{ gridColumn: '1/-1' }}>
            Title <span className="req">*</span>
            <input value={meta.title} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
              className="auth-input" placeholder="e.g. Computer Science Fundamentals" />
          </label>
          <label className="auth-label">
            Category
            <input value={meta.category} onChange={e => setMeta(m => ({ ...m, category: e.target.value }))}
              className="auth-input" placeholder="e.g. CS Basics" />
          </label>
          <label className="auth-label">
            Duration (minutes)
            <input type="number" min={1} value={meta.duration_minutes}
              onChange={e => setMeta(m => ({ ...m, duration_minutes: parseInt(e.target.value) || 30 }))}
              className="auth-input" />
          </label>
          <label className="auth-label" style={{ gridColumn: '1/-1' }}>
            Description
            <textarea value={meta.description} onChange={e => setMeta(m => ({ ...m, description: e.target.value }))}
              className="auth-input auth-textarea" rows={2} placeholder="Optional description" />
          </label>
        </div>
      </section>

      {/* ── Upload mode ── */}
      {mode === 'upload' && (
        <section className="create-section">
          <h2 className="create-section-title">Upload Quiz File</h2>
          <div className="upload-format-hint">
            <strong>Accepted formats:</strong>
            <div className="format-boxes">
              <div className="format-box">
                <strong>.docx format</strong>
                <pre className="format-pre">{`QUIZ TITLE: My Quiz
CATEGORY: Science
DURATION: 30

Q1 [MCQ] [5pts]
What is H2O?
A) Oxygen
B) Water [CORRECT]
C) Salt

Q2 [INTEGER] [5pts]
How many planets?
ANSWER: 8

Q3 [MSQ] [10pts]
Prime numbers?
A) 2 [CORRECT]
B) 4
C) 7 [CORRECT]`}</pre>
              </div>
              <div className="format-box">
                <strong>.html format</strong>
                <pre className="format-pre">{`<meta name="quiz-title" content="Quiz">
<meta name="category" content="Science">
<div class="question" data-type="mcq" data-points="5">
  <p>Question text</p>
  <ul>
    <li>Option A</li>
    <li class="correct">Option B</li>
  </ul>
</div>`}</pre>
              </div>
            </div>
          </div>
          <div className="upload-drop-area" onClick={() => fileRef.current?.click()}>
            {uploading ? '⏳ Parsing file…' : '📂 Click to select .html or .docx file'}
          </div>
          <input ref={fileRef} type="file" accept=".html,.htm,.docx" onChange={handleFileUpload} style={{ display: 'none' }} />

          {uploadPreview && uploadedQuestions.length > 0 && (
            <div className="upload-preview">
              <p className="upload-preview-label">✅ Parsed {uploadedQuestions.length} questions</p>
              {uploadedQuestions.map((q, i) => (
                <div key={q.id} className="preview-q">
                  <span className="preview-qnum">Q{i+1}</span>
                  <span className="preview-qtype">{q.type.toUpperCase()}</span>
                  <span className="preview-qtext">{q.text}</span>
                </div>
              ))}
              <button className="auth-btn" style={{ marginTop: '1rem' }} onClick={confirmUpload}>
                Use These Questions →
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Build mode: question list ── */}
      {mode === 'build' && (
        <section className="create-section">
          <div className="create-section-header">
            <h2 className="create-section-title">Questions ({questions.length})</h2>
            <button className="add-q-btn" onClick={() => setQuestions(prev => [...prev, blankQuestion()])}>
              + Add Question
            </button>
          </div>

          <div className="questions-list">
            {questions.map((q, qi) => (
              <div key={q.id} className="q-card">
                <div className="q-card-header">
                  <span className="q-card-num">Q{qi + 1}</span>
                  <select value={q.type} onChange={e => updateQ(q.id, { type: e.target.value as QuestionType })} className="q-type-select">
                    <option value="mcq">MCQ — Single correct</option>
                    <option value="msq">MSQ — Multiple correct</option>
                    <option value="integer">Integer — Numeric answer</option>
                  </select>
                  <input type="number" min={1} value={q.points}
                    onChange={e => updateQ(q.id, { points: parseInt(e.target.value) || 1 })}
                    className="q-points-input" title="Points" />
                  <span className="q-pts-label">pts</span>
                  <button className="q-delete-btn" onClick={() => setQuestions(prev => prev.filter(x => x.id !== q.id))}
                    disabled={questions.length === 1}>✕</button>
                </div>

                <textarea value={q.text} onChange={e => updateQ(q.id, { text: e.target.value })}
                  className="q-text-input" placeholder={`Question ${qi + 1} text…`} rows={2} />

                {/* Options for MCQ/MSQ */}
                {q.type !== 'integer' && (
                  <div className="q-options-list">
                    <p className="q-options-hint">
                      {q.type === 'mcq' ? '● Select one correct answer' : '☑ Select all correct answers'}
                    </p>
                    {q.options.map((opt, oi) => (
                      <div key={opt.id} className={`q-option-row ${opt.is_correct ? 'opt-correct' : ''}`}>
                        {q.type === 'mcq' ? (
                          <input type="radio" checked={opt.is_correct} onChange={() => setCorrectSingle(q.id, opt.id)}
                            className="opt-radio" title="Mark as correct" />
                        ) : (
                          <input type="checkbox" checked={opt.is_correct}
                            onChange={() => updateOpt(q.id, opt.id, { is_correct: !opt.is_correct })}
                            className="opt-radio" title="Mark as correct" />
                        )}
                        <span className="opt-letter">{String.fromCharCode(65 + oi)}.</span>
                        <input value={opt.text} onChange={e => updateOpt(q.id, opt.id, { text: e.target.value })}
                          className="opt-text-input" placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
                        {q.options.length > 2 && (
                          <button className="opt-remove-btn" onClick={() => removeOption(q.id, opt.id)}>✕</button>
                        )}
                      </div>
                    ))}
                    <button className="add-opt-btn" onClick={() => addOption(q.id)}>+ Add option</button>
                  </div>
                )}

                {/* Integer answer */}
                {q.type === 'integer' && (
                  <div className="q-integer-wrap">
                    <label className="auth-label" style={{ margin: 0 }}>
                      Correct Answer <span className="req">*</span>
                      <input type="number" value={q.integer_answer}
                        onChange={e => updateQ(q.id, { integer_answer: e.target.value })}
                        className="auth-input q-integer-input" placeholder="Enter the exact correct number" />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Save buttons ── */}
      <div className="create-actions">
        <button className="create-save-draft" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save as Draft'}
        </button>
        <button className="create-save-publish" onClick={() => handleSave(true)} disabled={saving}>
          {saving ? 'Saving…' : '🚀 Publish Quiz'}
        </button>
      </div>
    </main>
  );
}

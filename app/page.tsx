'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import EyeTracker, { ProctoringViolation } from './components/EyeTracker';
import ChatWidget from './components/ChatWidget';

/* ── Sample exam content ─────────────────────────────────────────────── */

const EXAM_QUESTIONS = [
  {
    id: 1,
    text: 'What is the time complexity of binary search on a sorted array of n elements?',
    options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
    points: 5,
  },
  {
    id: 2,
    text: 'Which data structure uses LIFO (Last In, First Out) ordering?',
    options: ['Queue', 'Linked List', 'Stack', 'Heap'],
    points: 5,
  },
  {
    id: 3,
    text: 'What does HTTP stand for?',
    options: [
      'HyperText Transfer Protocol',
      'High Transfer Technology Protocol',
      'Hyperlink Text Transmission Protocol',
      'HyperText Transmission Process',
    ],
    points: 5,
  },
  {
    id: 4,
    text: 'In object-oriented programming, what is encapsulation?',
    options: [
      'The ability to inherit properties from parent classes',
      'Bundling data and methods that operate on it into a single unit',
      'Overriding methods in derived classes',
      'Creating multiple instances of a class',
    ],
    points: 10,
  },
  {
    id: 5,
    text: 'Which sorting algorithm has an average-case complexity of O(n log n)?',
    options: ['Bubble Sort', 'Selection Sort', 'Merge Sort', 'Insertion Sort'],
    points: 5,
  },
  {
    id: 6,
    text: 'What is a primary key in a relational database?',
    options: [
      'A key used to encrypt data',
      'A column that uniquely identifies each row in a table',
      'The first column in any database table',
      'A foreign reference to another table',
    ],
    points: 10,
  },
];

const EXAM_DURATION = 45 * 60; // 45 minutes

/* ── Component ─────────────────────────────────────────────────────────── */

export default function ProctorPage() {
  const [examStarted, setExamStarted] = useState(false);
  const [violations, setViolations] = useState<ProctoringViolation[]>([]);
  const [activeAlert, setActiveAlert] = useState<ProctoringViolation | null>(null);
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addViolation = useCallback((v: ProctoringViolation) => {
    setViolations((prev) => [...prev, v]);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setActiveAlert(v);
    alertTimerRef.current = setTimeout(() => setActiveAlert(null), 4000);
  }, []);

  // Exam countdown
  useEffect(() => {
    if (!examStarted || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [examStarted, timeLeft]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const criticalCount = violations.filter((v) => v.severity === 'critical').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  /* ── Start screen ──────────────────────────────────────────────────── */
  if (!examStarted) {
    return (
      <main className="start-shell">
        <div className="orb orb-cyan" aria-hidden />
        <div className="orb orb-purple" aria-hidden />
        <div className="start-card">
          <div className="start-badge">🎯 ProctorAI</div>
          <h1 className="start-title">Computer Vision Proctored Exam</h1>
          <p className="start-desc">
            This exam is monitored in real time using AI-powered computer vision. Make sure your face is
            clearly visible and well-lit before beginning.
          </p>

          <ul className="start-rules">
            <li>
              <span className="rule-icon">👁️</span>
              <span>Eye movement &amp; gaze direction continuously tracked</span>
            </li>
            <li>
              <span className="rule-icon">🔄</span>
              <span>Tab switching and window-focus loss logged as violations</span>
            </li>
            <li>
              <span className="rule-icon">👥</span>
              <span>Multiple faces in frame flagged immediately</span>
            </li>
            <li>
              <span className="rule-icon">🚪</span>
              <span>Extended face absence from camera recorded</span>
            </li>
          </ul>

          <div className="start-meta">
            <span>⏱ Duration: <strong>45 minutes</strong></span>
            <span>📝 Questions: <strong>{EXAM_QUESTIONS.length}</strong></span>
            <span>💡 Open AI chat available during exam</span>
          </div>

          <button onClick={() => setExamStarted(true)} className="start-btn">
            Start Proctored Exam →
          </button>
        </div>
      </main>
    );
  }

  /* ── Exam screen ───────────────────────────────────────────────────── */
  return (
    <main className="proctor-shell">
      {/* ── Top status bar ── */}
      <header className="proctor-topbar">
        <div className="topbar-left">
          <span className="topbar-logo">🎯 ProctorAI</span>
          <span className="topbar-live">● LIVE</span>
        </div>

        <div className="topbar-center">Computer Science Assessment</div>

        <div className="topbar-right">
          <div
            className={`topbar-violations ${violations.length > 0 ? 'has-violations' : ''}`}
            title={`${criticalCount} critical, ${warningCount} warning`}
          >
            {criticalCount > 0 && <span className="viol-crit-badge">{criticalCount} 🚨</span>}
            {warningCount > 0 && <span className="viol-warn-badge">{warningCount} ⚠️</span>}
            {violations.length === 0 && <span className="viol-clear">✓ No violations</span>}
          </div>
          <div className={`topbar-timer ${timeLeft < 300 ? 'timer-urgent' : ''}`}>
            {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      {/* ── Violation alert banner ── */}
      {activeAlert && (
        <div
          className={`proctor-alert ${activeAlert.severity === 'critical' ? 'alert-critical' : 'alert-warning'}`}
          role="alert"
        >
          <span className="alert-icon">{activeAlert.severity === 'critical' ? '🚨' : '⚠️'}</span>
          <strong>{activeAlert.label}</strong>
          <span> — This event has been recorded.</span>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="proctor-body">
        {/* Exam content */}
        <section className="exam-area">
          <div className="exam-instructions">
            <h2 className="exam-section-title">Section 1 · Multiple Choice</h2>
            <p className="exam-section-sub">
              Select the best answer for each question. Each answer is automatically saved.
            </p>
          </div>

          <div className="exam-questions">
            {EXAM_QUESTIONS.map((q) => (
              <div key={q.id} className="exam-q">
                <p className="exam-q-text">
                  <strong className="exam-q-num">Q{q.id}.</strong> {q.text}
                  <span className="exam-q-pts">[{q.points} pts]</span>
                </p>
                <div className="exam-q-options">
                  {q.options.map((opt, oi) => {
                    const id = `q${q.id}-opt${oi}`;
                    return (
                      <label
                        key={oi}
                        htmlFor={id}
                        className={`exam-option ${answers[q.id] === opt ? 'exam-option-selected' : ''}`}
                      >
                        <input
                          id={id}
                          type="radio"
                          name={`q-${q.id}`}
                          value={opt}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                          className="exam-radio"
                        />
                        <span className="exam-option-letter">{String.fromCharCode(65 + oi)}.</span>
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="exam-submit-row">
            <button className="exam-submit-btn" onClick={() => alert('Exam submitted! Violations: ' + violations.length)}>
              Submit Exam
            </button>
            <span className="exam-submit-note">
              {Object.keys(answers).length} / {EXAM_QUESTIONS.length} answered
            </span>
          </div>
        </section>

        {/* ── Right panel: camera + violations ── */}
        <aside className="proctor-sidebar">
          <EyeTracker onViolation={addViolation} active={examStarted} />

          {violations.length > 0 && (
            <div className="viol-log">
              <div className="viol-log-header">Violations Log</div>
              <div className="viol-log-list">
                {[...violations].reverse().slice(0, 8).map((v) => (
                  <div key={v.id} className={`viol-entry viol-entry-${v.severity}`}>
                    <span className="viol-entry-icon">
                      {v.severity === 'critical' ? '🚨' : '⚠️'}
                    </span>
                    <div className="viol-entry-info">
                      <span className="viol-entry-label">{v.label}</span>
                      <span className="viol-entry-time">
                        {v.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ── Floating chat widget ── */}
      <ChatWidget />
    </main>
  );
}

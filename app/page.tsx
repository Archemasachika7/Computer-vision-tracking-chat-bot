'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import EyeTracker, { ProctoringViolation, ScreenShareStatus } from './components/EyeTracker';
import ChatWidget from './components/ChatWidget';

/* ── Sample exam questions ───────────────────────────────────────────── */
const EXAM_QUESTIONS = [
  { id: 1, text: 'What is the time complexity of binary search on a sorted array of n elements?',
    options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], points: 5 },
  { id: 2, text: 'Which data structure uses LIFO (Last In, First Out) ordering?',
    options: ['Queue', 'Linked List', 'Stack', 'Heap'], points: 5 },
  { id: 3, text: 'What does HTTP stand for?',
    options: ['HyperText Transfer Protocol', 'High Transfer Technology Protocol',
              'Hyperlink Text Transmission Protocol', 'HyperText Transmission Process'], points: 5 },
  { id: 4, text: 'In OOP, what is encapsulation?',
    options: ['Inheriting properties from parent classes',
              'Bundling data and methods into a single unit',
              'Overriding methods in derived classes',
              'Creating multiple instances of a class'], points: 10 },
  { id: 5, text: 'Which sorting algorithm has an average-case complexity of O(n log n)?',
    options: ['Bubble Sort', 'Selection Sort', 'Merge Sort', 'Insertion Sort'], points: 5 },
  { id: 6, text: 'What is a primary key in a relational database?',
    options: ['A key used to encrypt data',
              'A column that uniquely identifies each row in a table',
              'The first column in any table',
              'A foreign reference to another table'], points: 10 },
];

const EXAM_DURATION = 45 * 60;

/* ── Permission step ── */
type PermStep = 'idle' | 'camera' | 'screen' | 'screen-wrong' | 'ready';

export default function ProctorPage() {
  const [examStarted,   setExamStarted]   = useState(false);
  const [permStep,      setPermStep]      = useState<PermStep>('idle');
  const [violations,    setViolations]    = useState<ProctoringViolation[]>([]);
  const [activeAlert,   setActiveAlert]   = useState<ProctoringViolation | null>(null);
  const [timeLeft,      setTimeLeft]      = useState(EXAM_DURATION);
  const [answers,       setAnswers]       = useState<Record<number, string>>({});
  const [screenStatus,  setScreenStatus]  = useState<ScreenShareStatus>({ active: false, surface: null, error: null });
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addViolation = useCallback((v: ProctoringViolation) => {
    setViolations((prev) => [...prev, v]);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setActiveAlert(v);
    alertTimerRef.current = setTimeout(() => setActiveAlert(null), 4500);
  }, []);

  const handleScreenShareStatus = useCallback((s: ScreenShareStatus) => {
    setScreenStatus(s);
    if (s.error?.includes('ENTIRE SCREEN')) setPermStep('screen-wrong');
    else if (s.active)                       setPermStep('ready');
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!examStarted || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [examStarted, timeLeft]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const critCount = violations.filter((v) => v.severity === 'critical').length;
  const warnCount = violations.filter((v) => v.severity === 'warning').length;

  /* ═══════════════════════ START / PERMISSIONS SCREEN ══════════════════ */
  if (!examStarted) {
    return (
      <main className="start-shell">
        <div className="orb orb-cyan" aria-hidden />
        <div className="orb orb-purple" aria-hidden />

        <div className="start-card">
          <div className="start-badge">🎯 ProctorAI</div>
          <h1 className="start-title">Computer Vision Proctored Exam</h1>

          {/* ── Rules ── */}
          <p className="start-desc">
            This exam is monitored in real time using AI-powered computer vision and screen capture.
            Read the requirements below before starting.
          </p>

          <ul className="start-rules">
            <li><span className="rule-icon">👁️</span>
              <span><strong>Iris tracking</strong> — MediaPipe detects exact gaze direction using your iris position. Looking away repeatedly is flagged.</span>
            </li>
            <li><span className="rule-icon">🖥️</span>
              <span><strong>Full-screen share required</strong> — You must share your <em>entire monitor</em> (not a tab or window). Sharing the wrong surface is a critical violation.</span>
            </li>
            <li><span className="rule-icon">🔄</span>
              <span><strong>Tab &amp; focus tracking</strong> — Switching browser tabs or clicking away from the window is recorded.</span>
            </li>
            <li><span className="rule-icon">👥</span>
              <span><strong>Multiple faces</strong> — More than one face in the camera frame is flagged immediately.</span>
            </li>
          </ul>

          <div className="start-meta">
            <span>⏱ <strong>45 minutes</strong></span>
            <span>📝 <strong>{EXAM_QUESTIONS.length} questions</strong></span>
            <span>💡 AI chat assistant available</span>
          </div>

          {/* ── Permission steps ── */}
          {permStep === 'idle' && (
            <button
              className="start-btn"
              onClick={() => setPermStep('camera')}
            >
              Begin Permission Check →
            </button>
          )}

          {permStep === 'camera' && (
            <div className="perm-step">
              <p className="perm-label">Step 1 of 2 — Allow Camera</p>
              <p className="perm-hint">
                Your browser will ask for camera access. Click <strong>Allow</strong>.
              </p>
              <button
                className="start-btn"
                onClick={async () => {
                  try {
                    await navigator.mediaDevices.getUserMedia({ video: true });
                    setPermStep('screen');
                  } catch {
                    alert('Camera permission denied. Please allow camera access in your browser settings.');
                  }
                }}
              >
                Grant Camera Access 📷
              </button>
            </div>
          )}

          {permStep === 'screen' && (
            <div className="perm-step">
              <p className="perm-label">Step 2 of 2 — Share Entire Screen</p>
              <div className="perm-warning-box">
                ⚠️ In the dialog that opens, select <strong>&ldquo;Entire Screen&rdquo;</strong> (or your monitor),
                <strong> NOT</strong> &ldquo;Window&rdquo; or &ldquo;Chrome Tab&rdquo;. Sharing the wrong surface is a violation.
              </div>
              <button
                className="start-btn"
                onClick={async () => {
                  try {
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                      video: { displaySurface: 'monitor' } as any,
                      audio: false,
                    });
                    const settings = stream.getVideoTracks()[0].getSettings() as any;
                    const surface  = settings.displaySurface as string | undefined;

                    if (surface && surface !== 'monitor') {
                      stream.getTracks().forEach((t) => t.stop());
                      setPermStep('screen-wrong');
                    } else {
                      // Keep the stream alive so EyeTracker can reuse it
                      stream.getTracks().forEach((t) => t.stop());
                      setPermStep('ready');
                    }
                  } catch {
                    alert('Screen share denied. Screen sharing is required to start the exam.');
                  }
                }}
              >
                Share Entire Screen 🖥️
              </button>
            </div>
          )}

          {permStep === 'screen-wrong' && (
            <div className="perm-step">
              <div className="perm-error-box">
                🚫 You shared a <strong>window or tab</strong>, not your entire screen.
                Please try again and select <strong>&ldquo;Entire Screen&rdquo;</strong> from the dialog.
              </div>
              <button className="start-btn" onClick={() => setPermStep('screen')}>
                Try Again →
              </button>
            </div>
          )}

          {permStep === 'ready' && (
            <div className="perm-step">
              <div className="perm-success-box">
                ✅ Camera and screen share permissions granted. You&apos;re ready to begin.
              </div>
              <button className="start-btn" onClick={() => setExamStarted(true)}>
                Start Exam Now →
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  /* ═══════════════════════ EXAM SCREEN ══════════════════════════════════ */
  return (
    <main className="proctor-shell">

      {/* ── Top status bar ── */}
      <header className="proctor-topbar">
        <div className="topbar-left">
          <span className="topbar-logo">🎯 ProctorAI</span>
          <span className="topbar-live">● LIVE</span>
          {screenStatus.active
            ? <span className="topbar-screen-ok">🖥️ Screen Shared</span>
            : <span className="topbar-screen-err">🖥️ Screen Share Stopped</span>
          }
        </div>
        <div className="topbar-center">Computer Science Assessment</div>
        <div className="topbar-right">
          <div className={`topbar-violations ${violations.length > 0 ? 'has-violations' : ''}`}>
            {critCount > 0 && <span className="viol-crit-badge">{critCount} 🚨</span>}
            {warnCount > 0 && <span className="viol-warn-badge">{warnCount} ⚠️</span>}
            {violations.length === 0 && <span className="viol-clear">✓ Clean</span>}
          </div>
          <div className={`topbar-timer ${timeLeft < 300 ? 'timer-urgent' : ''}`}>
            {fmt(timeLeft)}
          </div>
        </div>
      </header>

      {/* ── Alert banner ── */}
      {activeAlert && (
        <div
          className={`proctor-alert ${activeAlert.severity === 'critical' ? 'alert-critical' : 'alert-warning'}`}
          role="alert"
        >
          <span className="alert-icon">{activeAlert.severity === 'critical' ? '🚨' : '⚠️'}</span>
          <strong>{activeAlert.label}</strong>
          <span> — Recorded at {activeAlert.timestamp.toLocaleTimeString()}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TOP ROW: Camera (left) + Violations log (right)
          stacked above the exam — camera gets full width
          of its section, no more narrow 240 px sidebar
      ══════════════════════════════════════════════════════ */}
      <div className="proctor-top-row">
        {/* Camera + eye status */}
        <div className="proctor-cam-col">
          <EyeTracker
            onViolation={addViolation}
            onScreenShareStatus={handleScreenShareStatus}
            active={examStarted}
          />
        </div>

        {/* Violations log */}
        <div className="proctor-viol-col">
          <div className="viol-log">
            <div className="viol-log-header">
              Violations Log &nbsp;
              <span className="viol-log-count">{violations.length} total</span>
            </div>
            <div className="viol-log-list">
              {violations.length === 0 ? (
                <div className="viol-empty">No violations recorded yet.</div>
              ) : (
                [...violations].reverse().map((v) => (
                  <div key={v.id} className={`viol-entry viol-entry-${v.severity}`}>
                    <span className="viol-entry-icon">{v.severity === 'critical' ? '🚨' : '⚠️'}</span>
                    <div className="viol-entry-info">
                      <span className="viol-entry-label">{v.label}</span>
                      <span className="viol-entry-time">{v.timestamp.toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          BOTTOM: Full-width exam content
      ══════════════════════════════════════════════════════ */}
      <div className="exam-area">
        <div className="exam-instructions">
          <h2 className="exam-section-title">Section 1 · Multiple Choice</h2>
          <p className="exam-section-sub">Select the best answer. Answers are saved automatically.</p>
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
          <button
            className="exam-submit-btn"
            onClick={() =>
              alert(
                `Exam submitted!\nAnswered: ${Object.keys(answers).length}/${EXAM_QUESTIONS.length}\nViolations: ${violations.length}`,
              )
            }
          >
            Submit Exam
          </button>
          <span className="exam-submit-note">
            {Object.keys(answers).length} / {EXAM_QUESTIONS.length} answered
          </span>
        </div>
      </div>

      {/* ── Floating chat ── */}
      <ChatWidget />
    </main>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ViolationType =
  | 'tab_switch'
  | 'window_blur'
  | 'no_face'
  | 'looking_away'
  | 'multiple_faces'
  | 'screen_share_stopped'
  | 'wrong_screen_share';

export interface ProctoringViolation {
  id: string;
  type: ViolationType;
  label: string;
  timestamp: Date;
  severity: 'warning' | 'critical';
}

const VIOLATION_META: Record<
  ViolationType,
  { label: string; severity: 'warning' | 'critical'; cooldown: number }
> = {
  tab_switch:            { label: 'Tab Switch Detected',          severity: 'critical', cooldown: 1500 },
  window_blur:           { label: 'Window Focus Lost',             severity: 'warning',  cooldown: 3000 },
  no_face:               { label: 'Face Not Detected',             severity: 'critical', cooldown: 5000 },
  looking_away:          { label: 'Looking Away from Screen',      severity: 'warning',  cooldown: 4000 },
  multiple_faces:        { label: 'Multiple Faces Detected',       severity: 'critical', cooldown: 3000 },
  screen_share_stopped:  { label: 'Screen Share Stopped',          severity: 'critical', cooldown: 2000 },
  wrong_screen_share:    { label: 'Must Share Entire Screen',      severity: 'critical', cooldown: 5000 },
};

export interface ScreenShareStatus {
  active: boolean;
  surface: string | null;   // 'monitor' | 'window' | 'browser' | null
  error: string | null;
}

interface EyeTrackerProps {
  onViolation: (v: ProctoringViolation) => void;
  onScreenShareStatus: (s: ScreenShareStatus) => void;
  active: boolean;
}

/* ── Gaze thresholds (iris ratio: 0 = far left, 1 = far right) ── */
const GAZE_LEFT_THRESHOLD  = 0.33;
const GAZE_RIGHT_THRESHOLD = 0.67;
const GAZE_UP_THRESHOLD    = 0.30;
const GAZE_DOWN_THRESHOLD  = 0.70;

export default function EyeTracker({ onViolation, onScreenShareStatus, active }: EyeTrackerProps) {
  const videoRef        = useRef<HTMLVideoElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const screenVideoRef  = useRef<HTMLVideoElement>(null);
  const camStreamRef    = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const rafRef          = useRef<number | null>(null);
  const lastViolRef     = useRef<Partial<Record<ViolationType, number>>>({});
  const absenceFrames   = useRef(0);
  const awayFrames      = useRef(0);

  const [camStatus,    setCamStatus]    = useState<'init' | 'ready' | 'denied'>('init');
  const [mlStatus,     setMlStatus]     = useState<'loading' | 'ready' | 'failed'>('loading');
  const [faceState,    setFaceState]    = useState<'unknown' | 'ok' | 'absent' | 'away' | 'multiple'>('unknown');
  const [gazeInfo,     setGazeInfo]     = useState<string>('');

  const fire = useCallback((type: ViolationType) => {
    const now  = Date.now();
    const last = lastViolRef.current[type] ?? 0;
    if (now - last < VIOLATION_META[type].cooldown) return;
    lastViolRef.current[type] = now;
    const { label, severity } = VIOLATION_META[type];
    onViolation({ id: `${type}-${now}`, type, label, severity, timestamp: new Date() });
  }, [onViolation]);

  /* ── Screen share setup ── */
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as any,
        audio: false,
      });

      const track    = stream.getVideoTracks()[0];
      const settings = track.getSettings() as any;
      const surface  = (settings.displaySurface as string) ?? null;

      if (surface && surface !== 'monitor') {
        // User shared a window or browser tab — not the full screen
        stream.getTracks().forEach((t) => t.stop());
        fire('wrong_screen_share');
        onScreenShareStatus({ active: false, surface, error: 'Please share your ENTIRE SCREEN (monitor), not a window or tab.' });
        return;
      }

      screenStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }

      onScreenShareStatus({ active: true, surface: surface ?? 'monitor', error: null });

      // Detect if the user stops sharing
      track.addEventListener('ended', () => {
        fire('screen_share_stopped');
        onScreenShareStatus({ active: false, surface: null, error: 'Screen share was stopped.' });
        screenStreamRef.current = null;
      });
    } catch {
      onScreenShareStatus({ active: false, surface: null, error: 'Screen share permission denied.' });
    }
  }, [fire, onScreenShareStatus]);

  /* ── Expose startScreenShare so parent can trigger it ── */
  useEffect(() => {
    if (active) startScreenShare();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /* ── Tab visibility + window focus ── */
  useEffect(() => {
    if (!active) return;
    const onHide = () => { if (document.hidden) fire('tab_switch'); };
    const onBlur = () => fire('window_blur');
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
    };
  }, [active, fire]);

  /* ── Camera stream ── */
  useEffect(() => {
    if (!active) return;
    let dead = false;

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .then((stream) => {
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        camStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCamStatus('ready');
      })
      .catch(() => { if (!dead) setCamStatus('denied'); });

    return () => {
      dead = true;
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  /* ── MediaPipe Face Landmarker (iris detection) ── */
  useEffect(() => {
    if (!active || camStatus !== 'ready') return;
    let dead = false;

    const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
    const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

    (async () => {
      try {
        const { FaceLandmarker, FilesetResolver, DrawingUtils } = await import('@mediapipe/tasks-vision');
        if (dead) return;

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        if (dead) return;

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',   // CPU avoids COEP/SharedArrayBuffer requirement
          },
          runningMode: 'VIDEO',
          numFaces: 3,
          outputFaceBlendshapes: false,
        });
        if (dead) { landmarker.close(); return; }

        setMlStatus('ready');

        let lastTs = -1;

        const loop = () => {
          if (dead) return;
          const video  = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }

          const now = performance.now();
          if (now === lastTs) { rafRef.current = requestAnimationFrame(loop); return; }
          lastTs = now;

          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;

          const result = landmarker.detectForVideo(video, now);
          const ctx    = canvas.getContext('2d')!;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const faces = result.faceLandmarks ?? [];
          const count = faces.length;

          /* ── Draw face mesh + iris ── */
          faces.forEach((lm) => {
            const W = canvas.width;
            const H = canvas.height;

            const pt = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H });

            // Face oval
            ctx.beginPath();
            FaceLandmarker.FACE_LANDMARKS_FACE_OVAL.forEach(({ start, end }) => {
              const s = pt(start); const e = pt(end);
              ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
            });
            ctx.strokeStyle = 'rgba(34,211,238,0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Left eye
            ctx.beginPath();
            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE.forEach(({ start, end }) => {
              const s = pt(start); const e = pt(end);
              ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
            });
            ctx.strokeStyle = 'rgba(56,189,248,0.85)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Right eye
            ctx.beginPath();
            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE.forEach(({ start, end }) => {
              const s = pt(start); const e = pt(end);
              ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
            });
            ctx.strokeStyle = 'rgba(56,189,248,0.85)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Iris circles (landmarks 468 = left iris center, 473 = right iris center)
            if (lm[468] && lm[473]) {
              [468, 473].forEach((idx) => {
                const c = pt(idx);
                ctx.beginPath();
                ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(250,204,21,0.9)';
                ctx.fill();
              });
            }
          });

          /* ── Violation logic ── */
          if (count === 0) {
            absenceFrames.current++;
            setFaceState('absent');
            setGazeInfo('');
            if (absenceFrames.current >= 20) {
              fire('no_face');
              absenceFrames.current = 0;
            }
          } else if (count > 1) {
            absenceFrames.current = 0;
            awayFrames.current    = 0;
            setFaceState('multiple');
            setGazeInfo('');
            fire('multiple_faces');
          } else {
            absenceFrames.current = 0;
            const lm = faces[0];

            // ── Iris gaze calculation ──────────────────────────────
            // Landmark indices (478-pt model):
            //   Left iris center : 468  Right iris center : 473
            //   Left eye inner   : 133  Left eye outer    : 33
            //   Right eye inner  : 362  Right eye outer   : 263
            //   Left eye top     : 159  Left eye bottom   : 145

            const gazeX_L = lm[468] && lm[33] && lm[133]
              ? (lm[468].x - lm[133].x) / Math.max(Math.abs(lm[33].x - lm[133].x), 0.001)
              : 0.5;
            const gazeX_R = lm[473] && lm[263] && lm[362]
              ? (lm[473].x - lm[362].x) / Math.max(Math.abs(lm[263].x - lm[362].x), 0.001)
              : 0.5;
            const gazeY = lm[468] && lm[159] && lm[145]
              ? (lm[468].y - lm[159].y) / Math.max(Math.abs(lm[145].y - lm[159].y), 0.001)
              : 0.5;

            const avgGazeX = (gazeX_L + gazeX_R) / 2;

            const lookingAway =
              avgGazeX < GAZE_LEFT_THRESHOLD  ||
              avgGazeX > GAZE_RIGHT_THRESHOLD ||
              gazeY    < GAZE_UP_THRESHOLD    ||
              gazeY    > GAZE_DOWN_THRESHOLD;

            const dirH = avgGazeX < GAZE_LEFT_THRESHOLD ? 'Looking Left'
                       : avgGazeX > GAZE_RIGHT_THRESHOLD ? 'Looking Right' : '';
            const dirV = gazeY < GAZE_UP_THRESHOLD ? 'Looking Up'
                       : gazeY > GAZE_DOWN_THRESHOLD ? 'Looking Down' : '';
            setGazeInfo([dirH, dirV].filter(Boolean).join(' + ') || 'Center');

            if (lookingAway) {
              awayFrames.current++;
              setFaceState('away');
              if (awayFrames.current >= 12) {
                fire('looking_away');
                awayFrames.current = 0;
              }
            } else {
              awayFrames.current = 0;
              setFaceState('ok');
            }
          }

          // ~15 fps is enough for proctoring; keeps CPU cool
          setTimeout(() => {
            if (!dead) rafRef.current = requestAnimationFrame(loop);
          }, 66);
        };

        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('MediaPipe init failed:', err);
        if (!dead) setMlStatus('failed');
      }
    })();

    return () => {
      dead = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, camStatus, fire]);

  const STATUS = {
    unknown:  { text: 'Initializing…',        color: '#94a3b8' },
    ok:       { text: 'Face Detected',         color: '#4ade80' },
    absent:   { text: 'No Face Detected',      color: '#f87171' },
    away:     { text: 'Looking Away',          color: '#facc15' },
    multiple: { text: 'Multiple Faces!',       color: '#fb923c' },
  };
  const s = STATUS[faceState];

  return (
    <div className="et-widget">
      <div className="et-header">
        <span className="et-dot-live" />
        <span className="et-title">Proctoring Camera</span>
        <span className="et-tech-badge">MediaPipe Iris</span>
      </div>

      <div className="et-feed">
        {camStatus === 'denied' ? (
          <div className="et-notice">📷 Camera access denied</div>
        ) : (
          <>
            <video ref={videoRef} muted playsInline className="et-video" />
            <canvas ref={canvasRef} className="et-canvas" />
            {/* hidden screen share video (used for stream tracking only) */}
            <video ref={screenVideoRef} muted playsInline style={{ display: 'none' }} />

            {camStatus === 'init' && (
              <div className="et-notice">Requesting camera…</div>
            )}
            {camStatus === 'ready' && mlStatus === 'loading' && (
              <div className="et-overlay">
                <div className="et-spinner" />
                <span>Loading MediaPipe models…</span>
              </div>
            )}
            {mlStatus === 'failed' && (
              <div className="et-overlay et-fallback">
                ⚠️ AI unavailable — tab tracking active
              </div>
            )}
          </>
        )}
      </div>

      <div className="et-status-row">
        <div className="et-status" style={{ color: s.color }}>
          <span className="et-status-dot" style={{ background: s.color }} />
          {s.text}
        </div>
        {gazeInfo && faceState === 'ok' && (
          <span className="et-gaze-info">👁 {gazeInfo}</span>
        )}
        {gazeInfo && faceState === 'away' && (
          <span className="et-gaze-away">⚠ {gazeInfo}</span>
        )}
      </div>
    </div>
  );
}

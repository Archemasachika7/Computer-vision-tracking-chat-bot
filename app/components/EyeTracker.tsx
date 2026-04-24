'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ViolationType =
  | 'tab_switch'
  | 'window_blur'
  | 'no_face'
  | 'looking_away'
  | 'multiple_faces';

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
  tab_switch:     { label: 'Tab Switch Detected',      severity: 'critical', cooldown: 1500 },
  window_blur:    { label: 'Window Focus Lost',         severity: 'warning',  cooldown: 3000 },
  no_face:        { label: 'Face Not Detected',         severity: 'critical', cooldown: 5000 },
  looking_away:   { label: 'Looking Away from Screen',  severity: 'warning',  cooldown: 5000 },
  multiple_faces: { label: 'Multiple Faces Detected',   severity: 'critical', cooldown: 3000 },
};

interface EyeTrackerProps {
  onViolation: (v: ProctoringViolation) => void;
  active: boolean;
}

export default function EyeTracker({ onViolation, active }: EyeTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastViolRef = useRef<Partial<Record<ViolationType, number>>>({});
  const absenceFrames = useRef(0);
  const awayFrames = useRef(0);

  const [camStatus, setCamStatus] = useState<'init' | 'ready' | 'denied'>('init');
  const [mlStatus, setMlStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [faceState, setFaceState] = useState<'unknown' | 'ok' | 'absent' | 'away' | 'multiple'>('unknown');

  const fire = useCallback(
    (type: ViolationType) => {
      const now = Date.now();
      const last = lastViolRef.current[type] ?? 0;
      if (now - last < VIOLATION_META[type].cooldown) return;
      lastViolRef.current[type] = now;
      const { label, severity } = VIOLATION_META[type];
      onViolation({ id: `${type}-${now}`, type, label, severity, timestamp: new Date() });
    },
    [onViolation],
  );

  // Tab visibility + window focus
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

  // Camera stream
  useEffect(() => {
    if (!active) return;
    let dead = false;

    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } })
      .then((stream) => {
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCamStatus('ready');
      })
      .catch(() => { if (!dead) setCamStatus('denied'); });

    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  // Face detection via face-api.js
  useEffect(() => {
    if (!active || camStatus !== 'ready') return;
    let dead = false;

    // Models served from jsDelivr CDN (included in the face-api.js npm package)
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

    import('face-api.js')
      .then(async (faceapi) => {
        if (dead) return;
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          ]);
          if (dead) return;
          setMlStatus('ready');

          const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 });

          const loop = async () => {
            if (dead) return;
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas || video.readyState < 2) {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }

            const detections = await faceapi
              .detectAllFaces(video, opts)
              .withFaceLandmarks(true);

            if (dead) return;

            // Draw face + eye overlays on canvas
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.clearRect(0, 0, canvas.width, canvas.height);

              const scale = { width: video.videoWidth, height: video.videoHeight };
              const resized = faceapi.resizeResults(detections, scale);

              resized.forEach(({ detection, landmarks }) => {
                const b = detection.box;
                ctx.strokeStyle = '#22d3ee';
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x, b.y, b.width, b.height);

                [landmarks.getLeftEye(), landmarks.getRightEye()].forEach((eye) => {
                  ctx.beginPath();
                  eye.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
                  ctx.closePath();
                  ctx.strokeStyle = '#38bdf8';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                });
              });
            }

            const count = detections.length;

            if (count === 0) {
              absenceFrames.current++;
              setFaceState('absent');
              if (absenceFrames.current >= 15) {
                fire('no_face');
                absenceFrames.current = 0;
              }
            } else if (count > 1) {
              absenceFrames.current = 0;
              awayFrames.current = 0;
              setFaceState('multiple');
              fire('multiple_faces');
            } else {
              absenceFrames.current = 0;
              // Gaze heuristic: nose tip offset vs jaw centerline
              const lm = detections[0].landmarks;
              const jaw = lm.getJawOutline();   // 17 pts: [0]=left ear, [16]=right ear
              const nose = lm.getNose();         // 9 pts: [6]=nose tip center
              const faceCenter = (jaw[0].x + jaw[16].x) / 2;
              const faceWidth = Math.abs(jaw[16].x - jaw[0].x);
              const deviation = faceWidth > 10 ? (nose[6].x - faceCenter) / faceWidth : 0;

              if (Math.abs(deviation) > 0.18) {
                awayFrames.current++;
                setFaceState('away');
                if (awayFrames.current >= 10) {
                  fire('looking_away');
                  awayFrames.current = 0;
                }
              } else {
                awayFrames.current = 0;
                setFaceState('ok');
              }
            }

            // ~10 fps detection to balance accuracy and performance
            setTimeout(() => {
              if (!dead) rafRef.current = requestAnimationFrame(loop);
            }, 100);
          };

          rafRef.current = requestAnimationFrame(loop);
        } catch (err) {
          console.error('Face-api model load failed:', err);
          if (!dead) setMlStatus('failed');
        }
      })
      .catch((err) => {
        console.error('face-api.js import failed:', err);
        if (!dead) setMlStatus('failed');
      });

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
      </div>

      <div className="et-feed">
        {camStatus === 'denied' ? (
          <div className="et-notice">📷 Camera access denied</div>
        ) : (
          <>
            <video ref={videoRef} muted playsInline className="et-video" />
            <canvas ref={canvasRef} className="et-canvas" />
            {camStatus === 'init' && (
              <div className="et-notice">Requesting camera…</div>
            )}
            {camStatus === 'ready' && mlStatus === 'loading' && (
              <div className="et-overlay">
                <div className="et-spinner" />
                <span>Loading AI models…</span>
              </div>
            )}
            {mlStatus === 'failed' && (
              <div className="et-overlay et-fallback">Tab tracking active</div>
            )}
          </>
        )}
      </div>

      <div className="et-status" style={{ color: s.color }}>
        <span className="et-status-dot" style={{ background: s.color }} />
        {s.text}
      </div>
    </div>
  );
}

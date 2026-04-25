'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface InlinePart  { text: string; bold?: boolean; italic?: boolean; code?: boolean }
interface TextSeg     { type: 'text'; content: string }
interface CodeSeg     { type: 'code'; language?: string; content: string }
type Segment = TextSeg | CodeSeg;

interface ImagePart   { inlineData: { mimeType: string; data: string } }
interface TextPart    { text: string }
type MsgPart = TextPart | ImagePart;

interface ChatMessage {
  role: 'user' | 'model';
  parts: MsgPart[];
  /** data-URL preview shown in the chat bubble (not sent to the API) */
  uiPreview?: string;
  /** file name for non-image attachments */
  uiFileName?: string;
}

interface AttachedFile {
  file: File;
  base64: string;
  mimeType: string;
  isImage: boolean;
  preview?: string;       // data-URL for images
  supabaseUrl?: string;
}

/* ── Markdown helpers (same as original chatbot) ─────────────────────── */

const formatInline = (text: string): InlinePart[] => {
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts: InlinePart[] = [];
  let cursor = 0;
  for (const m of text.matchAll(re)) {
    const tok = m[0];
    const idx = m.index ?? 0;
    if (idx > cursor) parts.push({ text: text.slice(cursor, idx) });
    if (tok.startsWith('**'))      parts.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith('*'))  parts.push({ text: tok.slice(1, -1), italic: true });
    else                           parts.push({ text: tok.slice(1, -1), code: true });
    cursor = idx + tok.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts.length ? parts : [{ text }];
};

const renderInline = (p: InlinePart, i: number) => {
  if (p.code)   return <code key={i} className="cw-inline-code">{p.text}</code>;
  if (p.bold)   return <strong key={i} className="font-semibold text-white">{p.text}</strong>;
  if (p.italic) return <em key={i} className="italic text-sky-100/90">{p.text}</em>;
  return <span key={i}>{p.text}</span>;
};

const splitSegments = (content: string): Segment[] => {
  const lines = content.split('\n');
  const segs: Segment[] = [];
  let txtBuf: string[] = [], codeBuf: string[] = [], lang = '', inCode = false;
  const pushText = () => { if (txtBuf.length) { segs.push({ type: 'text', content: txtBuf.join('\n') }); txtBuf = []; } };
  const pushCode = () => { segs.push({ type: 'code', language: lang || undefined, content: codeBuf.join('\n') }); codeBuf = []; lang = ''; };
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCode) pushCode();
      else { pushText(); lang = line.replace(/`/g, '').trim(); }
      inCode = !inCode;
      continue;
    }
    inCode ? codeBuf.push(line) : txtBuf.push(line);
  }
  if (inCode) { txtBuf.push('```' + lang); txtBuf.push(...codeBuf); }
  pushText();
  return segs;
};

const renderTextBlock = (content: string) =>
  content.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} className="cw-gap" aria-hidden />;
    if (t.startsWith('### ')) return <h4 key={i} className="cw-h3">{t.slice(4)}</h4>;
    if (t.startsWith('## '))  return <h3 key={i} className="cw-h2">{t.slice(3)}</h3>;
    if (t.startsWith('# '))   return <h2 key={i} className="cw-h1">{t.slice(2)}</h2>;
    if (t.startsWith('- ') || t.startsWith('* '))
      return (
        <div key={i} className="cw-li">
          <span className="cw-bullet" aria-hidden>▸</span>
          <span>{formatInline(t.slice(2)).map(renderInline)}</span>
        </div>
      );
    return <p key={i} className="cw-p">{formatInline(line).map(renderInline)}</p>;
  });

/* ── Component ─────────────────────────────────────────────────────────── */

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attached, setAttached] = useState<AttachedFile | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemma-4-26b-a4b-it');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, isLoading]);

  /* Parsed messages with segments for rendering */
  const parsedMessages = useMemo(
    () =>
      messages.map((m) => ({
        ...m,
        segments: m.parts
          .filter((p): p is TextPart => 'text' in p)
          .flatMap((p) => splitSegments(p.text)),
      })),
    [messages],
  );

  /* File selection → base64 + Supabase upload */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const isImage = file.type.startsWith('image/');

    const toBase64 = (): Promise<string> =>
      new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          res(result.split(',')[1]); // strip "data:...;base64,"
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

    const toDataUrl = (): Promise<string> =>
      new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = (ev) => res(ev.target?.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

    setUploadingFile(true);
    try {
      const [base64, dataUrl] = await Promise.all([toBase64(), toDataUrl()]);

      const af: AttachedFile = {
        file,
        base64,
        mimeType: file.type || 'application/octet-stream',
        isImage,
        preview: isImage ? dataUrl : undefined,
      };

      // Upload to Supabase (best-effort, non-blocking)
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const { url } = await res.json();
          af.supabaseUrl = url;
        }
      } catch {
        // Supabase upload failed; inline base64 still used for AI analysis
      }

      setAttached(af);
    } finally {
      setUploadingFile(false);
    }
  };

  /* Send message */
  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !attached) || isLoading) return;

    const parts: MsgPart[] = [];
    if (input.trim()) parts.push({ text: input });

    if (attached?.isImage) {
      parts.push({ inlineData: { mimeType: attached.mimeType, data: attached.base64 } });
    } else if (attached) {
      const ref = attached.supabaseUrl
        ? `[Attached: ${attached.file.name} → ${attached.supabaseUrl}]`
        : `[Attached file: ${attached.file.name}]`;
      parts.push({ text: ref });
    }

    const userMsg: ChatMessage = {
      role: 'user',
      parts,
      uiPreview: attached?.preview,
      uiFileName: !attached?.isImage ? attached?.file.name : undefined,
    };

    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setAttached(null);
    setIsLoading(true);

    try {
      // Strip UI-only fields before sending to API
      const apiContents = history.map(({ role, parts: p }) => ({ role, parts: p }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: apiContents, model: selectedModel }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          parts: [{ text: data.success ? data.text : `⚠️ ${data.error || 'Connection failed.'}` }],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'model', parts: [{ text: '⚠️ Network error. Could not reach the server.' }] },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* ── Expanded chat panel ── */}
      {open && (
        <div className="cw-panel">
          {/* Header */}
          <div className="cw-panel-header">
            <div>
              <div className="cw-panel-title">AI Assistant</div>
              <div className="cw-panel-sub">Gemma 4 · Multimodal</div>
            </div>
            <div className="cw-panel-controls">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="cw-model-select"
              >
                <option value="gemma-4-26b-a4b-it">Gemma 4 (26B)</option>
                <option value="gemma-4-31b-it">Gemma 4 (31B)</option>
              </select>
              <button onClick={() => setOpen(false)} className="cw-close" aria-label="Close chat">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="cw-log">
            {parsedMessages.length === 0 ? (
              <div className="cw-empty">Ask anything, or attach an image/file to analyze it!</div>
            ) : (
              parsedMessages.map((msg, idx) => (
                <article
                  key={idx}
                  className={`cw-row ${msg.role === 'user' ? 'cw-row-user' : 'cw-row-ai'}`}
                >
                  <div className={`cw-bubble ${msg.role === 'user' ? 'cw-bubble-user' : 'cw-bubble-ai'}`}>
                    {/* Image preview */}
                    {msg.uiPreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={msg.uiPreview} alt="attachment" className="cw-img-preview" />
                    )}
                    {/* File name badge (non-image) */}
                    {msg.uiFileName && (
                      <div className="cw-file-badge">📎 {msg.uiFileName}</div>
                    )}
                    {/* Text + code segments */}
                    {msg.segments.map((seg, si) =>
                      seg.type === 'code' ? (
                        <div key={si} className="cw-code-wrap">
                          {seg.language && <span className="cw-code-lang">{seg.language}</span>}
                          <pre className="cw-code-block"><code>{seg.content}</code></pre>
                        </div>
                      ) : (
                        <div key={si}>{renderTextBlock(seg.content)}</div>
                      ),
                    )}
                  </div>
                </article>
              ))
            )}

            {isLoading && (
              <article className="cw-row cw-row-ai">
                <div className="cw-bubble cw-bubble-ai typing">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </article>
            )}
            <div ref={endRef} />
          </div>

          {/* Attached file preview bar */}
          {(attached || uploadingFile) && (
            <div className="cw-attach-bar">
              {uploadingFile ? (
                <span className="cw-attach-uploading">Uploading…</span>
              ) : attached ? (
                <>
                  {attached.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attached.preview} alt="preview" className="cw-attach-thumb" />
                  ) : (
                    <span className="cw-attach-icon">📎</span>
                  )}
                  <span className="cw-attach-name">{attached.file.name}</span>
                  {attached.supabaseUrl && (
                    <span className="cw-attach-saved" title="Saved to Supabase">✓ Saved</span>
                  )}
                  <button onClick={() => setAttached(null)} className="cw-attach-remove">✕</button>
                </>
              ) : null}
            </div>
          )}

          {/* Footer / composer */}
          <div className="cw-footer">
            <form onSubmit={send} className="cw-form">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cw-attach-btn"
                aria-label="Attach file or image"
                title="Attach image or file"
              >
                📎
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.txt,.doc,.docx,.csv"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder={attached ? 'Add a message (optional)…' : 'Ask anything…'}
                className="cw-input"
                rows={1}
              />
              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !attached)}
                className="cw-send"
              >
                ➤
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Floating action button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`cw-fab ${open ? 'cw-fab-active' : ''}`}
        aria-label={open ? 'Close chat' : 'Open AI chat'}
      >
        <span className="cw-fab-icon">{open ? '✕' : '💬'}</span>
        {!open && <span className="cw-fab-label">Chat</span>}
      </button>
    </>
  );
}

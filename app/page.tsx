'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface InlinePart {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

interface TextSegment {
  type: 'text';
  content: string;
}

interface CodeSegment {
  type: 'code';
  language?: string;
  content: string;
}

type Segment = TextSegment | CodeSegment;

const formatInline = (text: string): InlinePart[] => {
  const inlineRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts: InlinePart[] = [];
  let cursor = 0;

  let match = inlineRegex.exec(text);

  while (match) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index) });
    }

    if (token.startsWith('**')) {
      parts.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('*')) {
      parts.push({ text: token.slice(1, -1), italic: true });
    } else {
      parts.push({ text: token.slice(1, -1), code: true });
    }

    cursor = index + token.length;
    match = inlineRegex.exec(text);
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) });
  }

  return parts.length > 0 ? parts : [{ text }];
};

const splitSegments = (content: string): Segment[] => {
  const lines = content.split('\n');
  const segments: Segment[] = [];
  let codeBuffer: string[] = [];
  let textBuffer: string[] = [];
  let language = '';
  let inCodeBlock = false;

  const pushTextBuffer = () => {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', content: textBuffer.join('\n') });
      textBuffer = [];
    }
  };

  const pushCodeBuffer = () => {
    segments.push({
      type: 'code',
      language: language || undefined,
      content: codeBuffer.join('\n'),
    });
    codeBuffer = [];
    language = '';
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        pushCodeBuffer();
      } else {
        pushTextBuffer();
        language = line.replace(/`/g, '').trim();
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
    } else {
      textBuffer.push(line);
    }
  }

  if (inCodeBlock) {
    textBuffer.push('```' + (language ? language : ''));
    textBuffer.push(...codeBuffer);
  }

  pushTextBuffer();

  return segments;
};

const renderTextBlock = (content: string) => {
  const lines = content.split('\n');

  return lines.map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <div key={`empty-${index}`} className="message-gap" aria-hidden />;
    }

    if (trimmed.startsWith('### ')) {
      return (
        <h4 key={`h3-${index}`} className="message-h3">
          {trimmed.slice(4)}
        </h4>
      );
    }

    if (trimmed.startsWith('## ')) {
      return (
        <h3 key={`h2-${index}`} className="message-h2">
          {trimmed.slice(3)}
        </h3>
      );
    }

    if (trimmed.startsWith('# ')) {
      return (
        <h2 key={`h1-${index}`} className="message-h1">
          {trimmed.slice(2)}
        </h2>
      );
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return (
        <div key={`li-${index}`} className="message-li">
          <span className="message-bullet" aria-hidden>
            ▸
          </span>
          <span>{formatInline(trimmed.slice(2)).map((part, idx) => renderInlinePart(part, idx))}</span>
        </div>
      );
    }

    return (
      <p key={`p-${index}`} className="message-p">
        {formatInline(line).map((part, idx) => renderInlinePart(part, idx))}
      </p>
    );
  });
};

const renderInlinePart = (part: InlinePart, index: number) => {
  if (part.code) {
    return (
      <code key={index} className="inline-code">
        {part.text}
      </code>
    );
  }

  if (part.bold) {
    return (
      <strong key={index} className="font-semibold text-white">
        {part.text}
      </strong>
    );
  }

  if (part.italic) {
    return (
      <em key={index} className="italic text-sky-100/95">
        {part.text}
      </em>
    );
  }

  return <span key={index}>{part.text}</span>;
};

export default function ChatApplication() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemma-4-26b-a4b-it');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const parsedMessages = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        segments: splitSegments(message.parts[0].text),
      })),
    [messages],
  );

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: input }] };
    const currentHistory = [...messages, userMessage];

    setMessages(currentHistory);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: currentHistory, model: selectedModel }),
      });

      const data = await res.json();

      if (data.success) {
        setMessages((prev) => [...prev, { role: 'model', parts: [{ text: data.text }] }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'model', parts: [{ text: '⚠️ Connection error. Please check your API key settings.' }] },
        ]);
      }
    } catch (error) {
      console.error('Network error', error);
      setMessages((prev) => [...prev, { role: 'model', parts: [{ text: '⚠️ Network error. Could not reach the server.' }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="futuristic-shell">
      <div className="orb orb-cyan" aria-hidden />
      <div className="orb orb-purple" aria-hidden />

      <section className="chat-frame">
        <header className="chat-header">
          <div>
            <p className="header-chip">Neural Chat Interface</p>
            <h1 className="header-title">Gemma 4 Dual-Core</h1>
            <p className="header-subtitle">Responsive, readable and optimized for long AI answers.</p>
          </div>

          <div className="header-controls">
            <label className="model-select-wrap">
              <span className="sr-only">Select model</span>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="model-select">
                <option value="gemma-4-26b-a4b-it">Gemma 4 (26B)</option>
                <option value="gemma-4-31b-it">Gemma 4 (31B)</option>
              </select>
            </label>

            <div className="status-pill">
              <span className="status-dot" />
              <span>Online</span>
            </div>
          </div>
        </header>

        <div className="chat-log">
          {parsedMessages.length === 0 ? (
            <div className="empty-state">System online. Select a model and start your prompt.</div>
          ) : (
            parsedMessages.map((msg, index) => (
              <article key={index} className={`message-row ${msg.role === 'user' ? 'message-row-user' : 'message-row-model'}`}>
                <div className={`message-bubble ${msg.role === 'user' ? 'message-bubble-user' : 'message-bubble-model'}`}>
                  {msg.segments.map((segment, segmentIndex) => {
                    if (segment.type === 'code') {
                      return (
                        <div key={`code-${segmentIndex}`} className="code-block-wrap">
                          {segment.language && <span className="code-lang">{segment.language}</span>}
                          <pre className="code-block">
                            <code>{segment.content}</code>
                          </pre>
                        </div>
                      );
                    }

                    return <div key={`text-${segmentIndex}`}>{renderTextBlock(segment.content)}</div>;
                  })}
                </div>
              </article>
            ))
          )}

          {isLoading && (
            <article className="message-row message-row-model">
              <div className="message-bubble message-bubble-model typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        <footer className="composer-wrap">
          <form onSubmit={sendMessage} className="composer-form">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your prompt..."
              className="composer-input"
              rows={2}
            />
            <button type="submit" disabled={isLoading || !input.trim()} className="composer-button">
              Send
            </button>
          </form>
        </footer>
      </section>
    </main>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export default function ChatApplication() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Defaulting to the 26B model
  const [selectedModel, setSelectedModel] = useState('gemma-4-26b-a4b-it');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        setMessages((prev) => [...prev, { role: 'model', parts: [{ text: "⚠️ Connection error. Please check your API key settings." }] }]);
      }
    } catch (error) {
      console.error("Network error");
      setMessages((prev) => [...prev, { role: 'model', parts: [{ text: "⚠️ Network error. Could not reach the server." }] }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col h-[85vh]">
        
        {/* Header Section with Gemma 4 Dropdown */}
        <div className="p-5 border-b border-slate-800 bg-slate-800/40 flex justify-between items-center rounded-t-2xl">
          <div>
            <h1 className="text-xl font-bold text-emerald-400">Gemma 4 Dual-Core</h1>
            <div className="mt-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-slate-950 text-slate-300 border border-slate-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 cursor-pointer"
              >
                <option value="gemma-4-26b-a4b-it">Gemma 4 (26B)</option>
                <option value="gemma-4-31b-it">Gemma 4 (31B)</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs text-slate-300">Online</span>
          </div>
        </div>

        {/* Chat Log Section */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              System Online. Select your Gemma 4 model to begin.
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.parts[0].text}</p>
                </div>
              </div>
            ))
          )}
          {isLoading && (
             <div className="flex justify-start">
               <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-5 py-4 flex gap-2 items-center">
                 <span className="animate-bounce h-2 w-2 bg-slate-400 rounded-full"></span>
                 <span className="animate-bounce delay-100 h-2 w-2 bg-slate-400 rounded-full"></span>
                 <span className="animate-bounce delay-200 h-2 w-2 bg-slate-400 rounded-full"></span>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar Section */}
        <div className="p-4 border-t border-slate-800 rounded-b-2xl">
          <form onSubmit={sendMessage} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Initialize query..."
              className="flex-1 bg-slate-950 text-slate-200 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-8 py-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </form>
        </div>

      </div>
    </main>
  );
}

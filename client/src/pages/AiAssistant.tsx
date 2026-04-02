import { useState, useRef, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { Send, Bot, User, RotateCcw, Sparkles } from 'lucide-react';
import type { ChatMessage } from '../types';

const SESSION_ID = `session_${Date.now()}`;

const STARTERS = [
  'Compare Banner and SITS for a UK university',
  'Which systems best support HESA Data Futures compliance?',
  'Help me think through requirements for a mid-size UK university',
  'What are the pros and cons of cloud vs on-premise SIS?',
  'Explain the difference between BC011 and BC028',
  'Which LMS has the best accessibility compliance?',
];

export function AiAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(SESSION_ID);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || isLoading) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sessionId,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await api.sendChatMessage(sessionId, message);
      const reply = res.data.data?.reply ?? 'No response';
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sessionId,
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sessionId,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please check that the server is running and your ANTHROPIC_API_KEY is set in .env.',
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const clear = async () => {
    try { await api.clearChatHistory(sessionId); } catch { /* ignore */ }
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <Header title="AI Procurement Assistant" subtitle="Ask questions about HERM capabilities, system comparisons, and procurement strategy" />

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col min-h-0 p-0 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-12">
                  <Bot className="w-12 h-12 mb-3 text-teal opacity-60" />
                  <p className="font-medium text-gray-500 dark:text-gray-400">HERM Procurement Assistant</p>
                  <p className="text-sm mt-1 max-w-sm">Ask me about system capabilities, HERM framework, procurement strategy, or vendor comparisons.</p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-teal text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>
                    {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-teal" />}
                  </div>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-teal text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-sm'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-teal" />
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder="Ask about HERM capabilities, system comparisons, procurement strategy..."
                  rows={2}
                  className="flex-1 resize-none text-sm border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-teal"
                />
                <Button onClick={() => void send()} disabled={!input.trim() || isLoading} size="md" className="self-end">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Press Enter to send · Shift+Enter for new line</p>
            </div>
          </Card>
        </div>

        {/* Sidebar: starters + actions */}
        <div className="w-72 flex-shrink-0 space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-teal" />
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Suggested Questions</h3>
            </div>
            <div className="space-y-2">
              {STARTERS.map(s => (
                <button key={s} onClick={() => void send(s)} className="w-full text-left text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors leading-snug">
                  {s}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-3">Session Controls</h3>
            <Button variant="secondary" size="sm" onClick={() => void clear()} className="w-full flex items-center gap-2">
              <RotateCcw className="w-3 h-3" /> Clear Conversation
            </Button>
            <p className="text-xs text-gray-400 mt-2">Conversation history is stored per session and cleared on page refresh.</p>
          </Card>
          <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <strong>Note:</strong> The AI Assistant requires an <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">ANTHROPIC_API_KEY</code> in your .env file. Without it, a helpful static response is returned.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

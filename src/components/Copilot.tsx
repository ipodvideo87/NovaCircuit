import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Cpu, 
  Layers, 
  Zap, 
  Terminal,
  Bot,
  User,
  MoreHorizontal,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { ProjectGraph, AIAction } from '../types';

interface Message {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  tasks?: string[];
  reasoning?: string;
}

interface FluxCopilotProps {
  onAiAction?: (actions: AIAction[], explanation?: string) => void;
  projectState?: ProjectGraph;
}

export default function FluxCopilot({ onAiAction, projectState }: FluxCopilotProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Engineering Agent initialized. Project graph loaded. I'm ready to assist with your hardware design. What are we building?", 
      timestamp: new Date() 
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentTask, setCurrentTask] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);
    setCurrentTask('Analyzing requirements...');

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: newMessages,
          projectState
        })
      });

      if (!response.ok) throw new Error("API failure");
      
      const data = await response.json();

      console.log("=== COPILOT RAW RESPONSE ===", data);
      console.log("=== ACTIONS RECEIVED ===", data.actions);

      // Extract reasoning if present in content
      let content = data.content || "";
      let reasoning = '';
      if (content.includes('STRATEGY:')) {
        const parts = content.split('STRATEGY:');
        content = parts[0].trim();
        reasoning = parts[1].trim();
      }

      const mappedActions = data.actions ? data.actions.map((a: any) => ({
        name: a.action || a.name,
        args: a.params || a.args
      })) : [];

      if (mappedActions.length > 0) {
        setCurrentTask(`Executing ${mappedActions.length} hardware operations...`);
        await new Promise(r => setTimeout(r, 800)); // Simulate task execution
      }

      let errorText = "";
      if (data.errors && data.errors.length > 0) {
        errorText = `\n\n[WARNING] Action Validation Errors:\n` + data.errors.map((e: string) => `- ${e}`).join('\n');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: (content || "Operations complete.") + errorText,
        reasoning,
        tasks: mappedActions.map((a: any) => a.name),
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (mappedActions.length > 0 && onAiAction) {
        console.log("=== CALLING onAiAction WITH ===", JSON.stringify(data.actions, null, 2));
        alert("Actions received: " + JSON.stringify(data.actions, null, 2));
        onAiAction(mappedActions, content);
      }
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Critical failure in hardware reasoning node. Resetting agent.",
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
      setCurrentTask('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-gray-200 border-l border-white/5 shadow-2xl relative overflow-hidden font-mono">
      {/* Agent Header */}
      <div className="p-4 border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.4)]">
              <Bot size={18} className="text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0a0a0a]" />
          </div>
          <div>
            <h2 className="text-[12px] font-black uppercase tracking-tighter text-white leading-none">Flux Agent v4</h2>
            <div className="flex items-center gap-2 mt-1.5">
               <span className="text-[7px] text-emerald-400 font-bold uppercase py-0.5 px-1 bg-emerald-400/10 rounded">Online</span>
               <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest">Expert Mode</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="text-right hidden sm:block">
              <div className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Uptime</div>
              <div className="text-[10px] text-white tabular-nums">99.98%</div>
           </div>
        </div>
      </div>

      {/* Chat / Terminal Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
        {messages.map((m, i) => (
          <div key={i} className="space-y-3">
            <div className={cn(
              "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest",
              m.role === 'assistant' ? "text-indigo-400" : "text-gray-500"
            )}>
              {m.role === 'assistant' ? <Bot size={12} /> : <User size={12} />}
              {m.role === 'assistant' ? "Flux.Agent" : "Developer"}
              <span className="ml-auto opacity-30 font-normal">{m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className={cn(
              "p-4 rounded-lg text-[13px] leading-relaxed relative border",
              m.role === 'assistant' 
                ? "bg-white/[0.02] border-white/5 text-gray-300" 
                : "bg-indigo-600/[0.05] border-indigo-500/20 text-indigo-100"
            )}>
              {m.reasoning && (
                <div className="mb-4 p-3 bg-white/[0.03] border border-white/5 rounded-md">
                  <div className="text-[10px] text-gray-500 uppercase font-black mb-1.5 flex items-center gap-2">
                    <Terminal size={10} />
                    Agent Reasoning
                  </div>
                  <div className="text-[11px] text-indigo-300/80 italic font-sans leading-relaxed">
                    {m.reasoning}
                  </div>
                </div>
              )}

              <div className="font-sans">
                {m.content}
              </div>

              {m.tasks && m.tasks.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                   <div className="text-[9px] text-gray-600 uppercase font-black tracking-widest mb-2">Operations Executed</div>
                   {m.tasks.map((task, idx) => (
                     <div key={idx} className="flex items-center gap-2 text-[11px] text-emerald-400/80">
                        <ShieldCheck size={12} />
                        <span className="font-mono">CALL::{task.toUpperCase()}</span>
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isTyping && (
           <div className="space-y-3">
             <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
               <Bot size={12} />
               Flux.Agent
               <motion.span 
                 animate={{ opacity: [1, 0, 1] }} 
                 className="ml-2 w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_5px_rgba(79,70,229,1)]"
               />
             </div>
             <div className="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
                <div className="flex flex-col gap-3">
                   <div className="flex items-center gap-2 text-[11px] text-gray-500 font-mono">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                        <Zap size={12} className="text-warning-500" />
                      </motion.div>
                      {currentTask || "Processing project graph..."}
                   </div>
                   <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-indigo-600"
                        animate={{ width: ["0%", "100%"] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                      />
                   </div>
                </div>
             </div>
           </div>
        )}
      </div>

      {/* Action Buttons - Expert Tools */}
      <div className="px-4 py-3 bg-[#0a0a0a] border-y border-white/5 flex gap-2 overflow-x-auto scrollbar-hide">
         {[
           { label: 'Run DRC', icon: <ShieldCheck size={11} />, cmd: 'run design rule check' },
           { label: 'Design Review', icon: <Sparkles size={11} />, cmd: 'analyze design for signal integrity issues' },
           { label: 'Calc Trace', icon: <Zap size={11} />, cmd: 'calculate trace width for 5 Amps' }
         ].map((tool, i) => (
           <button 
             key={i} 
             onClick={() => { setInput(tool.cmd); handleSend(); }}
             className="px-3 py-1.5 bg-white/5 hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/20 rounded text-[10px] font-bold text-gray-500 hover:text-indigo-400 transition-all flex items-center gap-1.5 whitespace-nowrap"
           >
             {tool.icon}
             {tool.label}
           </button>
         ))}
      </div>

      {/* Input Area */}
      <div className="p-5 bg-[#0a0a0a] shrink-0">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500/50 font-mono text-sm leading-none">{'>'}</div>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Instruct Flux Agent..." 
            className="w-full bg-[#111] border border-white/5 rounded-lg py-4 pl-10 pr-12 text-[13px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-gray-800 font-medium"
          />
          <button 
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-500 hover:text-white p-2 rounded transition-all disabled:opacity-10"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

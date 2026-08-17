'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, User, Send, Sparkles, Wand2, Info } from 'lucide-react';
import Image from 'next/image';

const SUGGESTED_PROMPTS = [
  "Which cleanser is best for oily skin?",
  "Routine for pigmentation",
  "How to use Retinol?",
  "Best selling products"
];

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Welcome to Avyora Clinical Support. I am your AI Skincare Expert. How can I help you achieve your skin goals today?' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = (text: string = input) => {
    if (!text) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    
    // Simulated Clinical AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', text: "Analyzing your request based on Avyora clinical data... We recommend starting with our Face Wash followed by the Vitamin C Serum for optimized brightening and dermal health." }]);
    }, 1000);
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col h-[70vh] border-2 bg-white">
          <div className="p-4 border-b flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">Avyora Assistant</h2>
                <p className="text-[8px] uppercase tracking-widest opacity-60 text-foreground">Clinical Simulation Active</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FAFAF8] dark:bg-background">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                  msg.role === 'user' ? "bg-card text-foreground" : "bg-primary text-primary-foreground"
                )}>
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "p-4 text-xs leading-relaxed max-w-[80%] border-2",
                  msg.role === 'user' ? "bg-card border-border" : "bg-white dark:bg-card border-primary/20"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 border-t space-y-4">
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map(p => (
                <button 
                  key={p} 
                  onClick={() => handleSend(p)}
                  className="text-[8px] font-bold uppercase tracking-widest px-3 py-1.5 border-2 hover:border-primary hover:text-primary transition-all bg-card"
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="Ask about ingredients, routines..." 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                className="rounded-none border-2 h-12 text-xs focus-visible:ring-0 focus-visible:border-primary"
              />
              <Button onClick={() => handleSend()} className="rounded-none h-12 px-8 bg-foreground text-background hover:bg-primary transition-colors">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 text-[7px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
              <Info className="h-2.5 w-2.5" />
              Simulated clinical results. Consult a dermatologist for personal medical advice.
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="rounded-none border-2 bg-accent/5 border-foreground">
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                SkinInsights AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video bg-muted border-2 border-foreground overflow-hidden">
                <Image 
                  src="https://picsum.photos/seed/insight/400/300" 
                  alt="Skin Scan" 
                  fill 
                  className="object-cover opacity-50 grayscale"
                  data-ai-hint="skincare model"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wand2 className="h-8 w-8 text-primary opacity-50" />
                </div>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-relaxed font-bold">
                Synthesize a custom routine through clinical photo analysis.
              </p>
              <Button className="w-full rounded-none border-2 border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background font-black uppercase tracking-widest text-[10px] py-6 transition-all">
                Upload Selfie
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

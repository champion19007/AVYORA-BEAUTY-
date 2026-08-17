'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, User, Send, Sparkles, Wand2 } from 'lucide-react';
import Image from 'next/image';

const SUGGESTED_PROMPTS = [
  "Which cleanser is best for oily skin?",
  "Routine for pigmentation",
  "How to use Retinol?",
  "Best selling products"
];

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hello! I am your AI Skincare Expert. How can I help you achieve your skin goals today?' }
  ]);
  const [input, setInput] = useState('');

  const handleSend = (text: string = input) => {
    if (!text) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    
    // Simulated AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', text: "That's a great question. Based on our clinical data, we recommend starting with a Salicylic Acid based cleanser followed by our Niacinamide 10% serum for balanced, clear skin." }]);
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
                <h2 className="text-xs font-bold uppercase tracking-widest">AI Skin Assistant</h2>
                <p className="text-[8px] uppercase tracking-widest opacity-60">Online & Active</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                  msg.role === 'user' ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                )}>
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "p-4 text-xs leading-relaxed max-w-[80%] border",
                  msg.role === 'user' ? "bg-muted/50" : "bg-white"
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
                  className="text-[8px] font-bold uppercase tracking-widest px-3 py-1.5 border hover:border-primary hover:text-primary transition-all"
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
                className="rounded-none border-2 h-12 text-xs"
              />
              <Button onClick={() => handleSend()} className="rounded-none h-12 px-8 bg-primary">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="rounded-none border-2 bg-accent/5">
            <CardHeader>
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                SkinInsights AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video bg-muted border overflow-hidden">
                <Image 
                  src="https://picsum.photos/seed/insight/400/300" 
                  alt="Skin Scan" 
                  fill 
                  className="object-cover opacity-50"
                  data-ai-hint="skincare model"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wand2 className="h-8 w-8 text-primary opacity-50" />
                </div>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-relaxed">
                Upload a photo to get a clinical analysis of your skin health and personalized routine.
              </p>
              <Button className="w-full rounded-none border-2 hover:bg-primary hover:text-primary-foreground font-bold uppercase tracking-widest text-[10px]">
                Start Skin Scan
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
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, X, Sparkles } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { getHospital, getDoctor } from "@/lib/data";
import { formatCurrency, generateId } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import { cn } from "@/lib/utils";

function getReply(input: string): string {
  const q = input.toLowerCase();
  const hospital = getHospital();
  const doctor = getDoctor();

  if (/appoint|book|slot/.test(q)) {
    return `You can book an appointment online at /appointment, via WhatsApp, or call ${hospital.phones.join(" / ")}. Morning, afternoon, and evening slots are available (demo calendar).`;
  }
  if (/avail|doctor|when|timing|hours|time/.test(q)) {
    return `${doctor.name} consults during OPD hours: ${hospital.timings.opd}. Emergency care: ${hospital.timings.emergency}.`;
  }
  if (/emerg|ambulance|urgent|critical/.test(q)) {
    return `For emergencies call ${hospital.emergencyPhone} immediately. 24×7 ambulance and critical care are available at Sri Srinivasa Hospital.`;
  }
  if (/fee|cost|price|charge/.test(q)) {
    return `Consultation fee is approximately ${formatCurrency(doctor.consultationFee)}. Video consultation is ${formatCurrency(doctor.videoConsultationFee)}. Packages and tests are extra.`;
  }
  if (/locat|address|where|map|badvel/.test(q)) {
    return `We are at ${hospital.address.line1}, ${hospital.address.line2}, ${hospital.address.city}, ${hospital.address.state} ${hospital.address.pincode}.`;
  }
  if (/service|treat|pulmon|asthma|copd|lung/.test(q)) {
    return `We specialize in Pulmonology, Asthma, COPD, Respiratory Medicine, Sleep Medicine, Critical Care, Video Consultation, and Emergency Care.`;
  }
  if (/insur|cashless|claim/.test(q)) {
    return `We support major insurers including Star Health, Niva Bupa, HDFC Ergo, ICICI Lombard, Care Health, and Reliance General. Visit the Insurance page for details.`;
  }
  if (/hello|hi|namaste|hey/.test(q)) {
    return `Hello! How can I help you today? You can ask about appointments, doctor availability, emergency, timings, fees, location, services, or insurance.`;
  }
  return `I can help with: Book Appointment, Doctor Availability, Emergency, Hospital Timing, Fees, Location, Services, and Insurance. Please ask one of these, or visit our Contact page for personalized support.`;
}

export function AiChatbot() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          id: generateId("msg"),
          role: "assistant",
          content: t.chatbot.greeting,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [open, messages.length, t.chatbot.greeting]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = async () => {
    const text = input.trim();
    if (!text || typing) return;
    const userMsg: ChatMessage = {
      id: generateId("msg"),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 800));
    const reply: ChatMessage = {
      id: generateId("msg"),
      role: "assistant",
      content: getReply(text),
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, reply]);
    setTyping(false);
  };

  const quick = [
    "Book Appointment",
    "Doctor Availability",
    "Emergency",
    "Hospital Timing",
    "Fees",
    "Location",
    "Services",
    "Insurance",
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            className="fixed bottom-28 right-6 z-50 flex h-[min(560px,70vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-lift"
            role="dialog"
            aria-label="AI Health Assistant"
          >
            <div className="flex items-center justify-between bg-hero-gradient px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-white/20 p-2">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.chatbot.title}</div>
                  <div className="text-[11px] text-white/80">Demo AI · Instant answers</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-white/15"
                aria-label="Close chatbot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-primary-600 text-white"
                      : "bg-muted text-foreground"
                  )}
                >
                  {m.content}
                </div>
              ))}
              {typing && (
                <div className="flex w-fit items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
              {quick.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setInput(q);
                  }}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              className="flex gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t.chatbot.placeholder}
                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Chat message"
              />
              <button
                type="submit"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1 }}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-hero-gradient text-white shadow-lift hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:left-auto sm:right-[5.5rem]"
        aria-label="Open AI assistant"
        style={{ right: undefined }}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </motion.button>
    </>
  );
}

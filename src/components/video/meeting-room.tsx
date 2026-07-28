"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MessageSquare,
  PhoneOff,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDoctor } from "@/lib/data";

export function MeetingRoom() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [screenShare, setScreenShare] = useState(false);
  const [messages, setMessages] = useState<
    { id: string; from: string; text: string }[]
  >([
    {
      id: "1",
      from: "System",
      text: "Welcome to the demo meeting room. Camera preview is local-only.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const doctor = getDoctor();

  useEffect(() => {
    let stream: MediaStream | null = null;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        // Camera permission denied — demo still works with placeholder
      }
    };
    void start();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getAudioTracks().forEach((t) => {
      t.enabled = micOn;
    });
    stream?.getVideoTracks().forEach((t) => {
      t.enabled = camOn;
    });
  }, [micOn, camOn]);

  const sendChat = () => {
    if (!chatInput.trim()) return;
    setMessages((m) => [
      ...m,
      { id: String(Date.now()), from: "You", text: chatInput.trim() },
    ]);
    setChatInput("");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: String(Date.now() + 1),
          from: "Doctor",
          text: "Thank you. Please describe your symptoms when ready. (Demo reply)",
        },
      ]);
    }, 900);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-primary-950 text-white">
      <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Video Consultation</h1>
            <p className="text-sm text-white/60">
              with {doctor.name} · Demo meeting
            </p>
          </div>
          <div className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
            ● Connected (Simulated)
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="relative aspect-video overflow-hidden rounded-3xl bg-black/40">
            {camOn ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={cn(
                  "h-full w-full object-cover",
                  !camOn && "hidden"
                )}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
                    <User className="h-10 w-10" />
                  </div>
                  <p className="text-white/70">Camera is off</p>
                </div>
              </div>
            )}

            <div className="absolute bottom-4 right-4 h-28 w-40 overflow-hidden rounded-2xl border border-white/20 bg-primary-900 shadow-lift">
              <div className="flex h-full flex-col items-center justify-center p-2 text-center">
                <User className="mb-1 h-8 w-8 text-white/70" />
                <div className="text-xs font-medium">{doctor.name}</div>
                <div className="text-[10px] text-white/50">Doctor</div>
              </div>
            </div>

            {screenShare && (
              <div className="absolute left-4 top-4 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-black">
                Screen sharing (demo)
              </div>
            )}
          </div>

          {chatOpen && (
            <div className="flex h-[min(420px,50vh)] flex-col rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur lg:h-auto">
              <div className="mb-3 font-semibold">Meeting Chat</div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id} className="rounded-xl bg-white/10 px-3 py-2 text-sm">
                    <div className="text-[11px] font-semibold text-primary-200">
                      {m.from}
                    </div>
                    <div className="text-white/90">{m.text}</div>
                  </div>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat();
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <Button type="submit" size="sm">
                  Send
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Control
            active={micOn}
            onClick={() => setMicOn((v) => !v)}
            label={micOn ? "Mute" : "Unmute"}
          >
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </Control>
          <Control
            active={camOn}
            onClick={() => setCamOn((v) => !v)}
            label={camOn ? "Stop video" : "Start video"}
          >
            {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Control>
          <Control
            active={screenShare}
            onClick={() => setScreenShare((v) => !v)}
            label="Screen share"
          >
            <MonitorUp className="h-5 w-5" />
          </Control>
          <Control
            active={chatOpen}
            onClick={() => setChatOpen((v) => !v)}
            label="Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </Control>
          <Link href="/video-consult">
            <button
              type="button"
              className="inline-flex h-14 items-center gap-2 rounded-full bg-emergency px-6 font-semibold text-white shadow-lift hover:bg-red-700"
            >
              <PhoneOff className="h-5 w-5" />
              Leave Meeting
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Control({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex h-14 w-14 items-center justify-center rounded-full transition",
        active
          ? "bg-white/15 text-white hover:bg-white/25"
          : "bg-white/10 text-white/70 hover:bg-white/20"
      )}
    >
      {children}
    </button>
  );
}

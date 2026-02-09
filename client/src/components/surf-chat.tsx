import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, X, Send, Loader2, Trash2 } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SurfChatProps {
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  forecastData?: any | null;
  isMobile?: boolean;
  hasForecastPanel?: boolean;
}

export function SurfChat({ latitude, longitude, locationName, forecastData, isMobile, hasForecastPanel }: SurfChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: trimmed }]);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
          locationName: locationName ?? undefined,
          forecastData: forecastData ?? undefined,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "conversation" && event.id) {
              setConversationId(event.id);
            } else if (event.type === "content") {
              assistantContent += event.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => [
        ...prev.filter(m => !(m.role === "assistant" && m.content === "")),
        { role: "assistant", content: "Sorry, I couldn't process that request. Please try again." },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, conversationId, latitude, longitude, locationName, forecastData]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    if (conversationId) {
      fetch(`/api/chat/${conversationId}`, { method: "DELETE" }).catch(() => {});
    }
    setMessages([]);
    setConversationId(null);
  };

  const formatContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <div key={i} className="flex gap-1.5 ml-1">
            <span className="text-primary shrink-0 mt-0.5">&#x2022;</span>
            <span>{formatBold(line.slice(2))}</span>
          </div>
        );
      }
      if (line.match(/^\d+\./)) {
        return <div key={i} className="ml-1">{formatBold(line)}</div>;
      }
      if (line.trim() === "") return <div key={i} className="h-2" />;
      return <div key={i}>{formatBold(line)}</div>;
    });
  };

  const formatBold = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
    );
  };

  const chatButtonBottom = isMobile && hasForecastPanel ? 64 : 16;
  const panelPosition = isMobile
    ? "fixed inset-x-2 bottom-2 top-16 z-[1001]"
    : "fixed bottom-4 right-4 z-[1001] w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-6rem)]";

  return (
    <>
      {!open && (
        <Button
          size="icon"
          className="rounded-full shadow-lg"
          style={{
            position: "fixed",
            right: 16,
            bottom: chatButtonBottom,
            zIndex: 1001,
            width: 48,
            height: 48,
          }}
          onClick={() => setOpen(true)}
          data-testid="button-open-chat"
        >
          <MessageCircle className="w-5 h-5" />
        </Button>
      )}

      {open && (
        <Card className={`${panelPosition} flex flex-col shadow-xl overflow-hidden`}>
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">SurfCast AI</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <Button size="icon" variant="ghost" onClick={clearChat} data-testid="button-clear-chat">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} data-testid="button-close-chat">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
                <MessageCircle className="w-10 h-10 text-muted-foreground/40" />
                <div>
                  <p className="text-sm font-medium text-foreground">Ask about surf conditions</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    I use real-time weather and wave data to recommend the best spots near you.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                  {[
                    "Where should I surf today?",
                    "Best waves in Bali this week?",
                    "Is it good for beginners right now?",
                  ].map((q) => (
                    <button
                      key={q}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground hover-elevate transition-colors"
                      onClick={() => {
                        setInput(q);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      data-testid={`suggestion-${q.slice(0, 10).replace(/\s/g, "-")}`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                  data-testid={`chat-message-${msg.role}-${i}`}
                >
                  {msg.role === "assistant" ? (
                    msg.content === "" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="space-y-1">{formatContent(msg.content)}</div>
                    )
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t border-border shrink-0">
            <div className="flex gap-1.5">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about surf conditions..."
                disabled={isStreaming}
                className="text-sm"
                data-testid="input-chat-message"
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
                data-testid="button-send-chat"
              >
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

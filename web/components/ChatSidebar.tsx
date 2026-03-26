// ChatSidebar.tsx — Streaming AI chat sidebar component.
// Lives on the right side of the dashboard. Supports SSE streaming, tool-use
// action cards, personality presets, conversation history, and quick actions.

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { backendFetch, apiStream, type SSEEvent } from "@/lib/api";
import ChatMessage, { type ChatMessageData, type ActionTaken } from "@/components/ChatMessage";
import { ThinkingOrb, ThinkingDots } from "@/components/ui/Loading";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at?: string;
}

interface Personality {
  id: string;
  name: string;
  description: string;
  color: string; // dot color
}

const PERSONALITIES: Personality[] = [
  { id: "coach", name: "Coach", description: "Direct and motivating", color: "#7c3aed" },
  { id: "friend", name: "Friend", description: "Chill and supportive", color: "#22c55e" },
  { id: "mentor", name: "Mentor", description: "Wise and thoughtful", color: "#3b82f6" },
  { id: "drill_sergeant", name: "Drill Sergeant", description: "No excuses", color: "#ef4444" },
];

const QUICK_ACTIONS = [
  "What should I work on?",
  "How are my grades?",
  "Help me study",
  "What's due soon?",
];

const STORAGE_KEY_EXPANDED = "schoolpilot_chat_expanded";
const STORAGE_KEY_PERSONALITY = "schoolpilot_chat_personality";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatSidebar() {
  // ---- UI state ----
  const [isExpanded, setIsExpanded] = useState(true);
  const [showConversations, setShowConversations] = useState(false);
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);

  // ---- Chat state ----
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [personality, setPersonality] = useState("coach");

  // ---- Streaming state ----
  const [streamingText, setStreamingText] = useState("");
  const [streamingActions, setStreamingActions] = useState<ActionTaken[]>([]);
  const streamControllerRef = useRef<{ abort: () => void } | null>(null);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const personalityPickerRef = useRef<HTMLDivElement>(null);
  const sendMessageRef = useRef<((text?: string) => Promise<void>) | undefined>(undefined);

  // ---- Persist expand state and personality via localStorage ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXPANDED);
      if (saved !== null) setIsExpanded(saved === "true");
      const savedPers = localStorage.getItem(STORAGE_KEY_PERSONALITY);
      if (savedPers && PERSONALITIES.some((p) => p.id === savedPers)) {
        setPersonality(savedPers);
      }
    } catch (err) {
      console.warn("localStorage unavailable (SSR / incognito):", err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXPANDED, String(isExpanded));
    } catch (err) {
      console.warn("Failed to persist chat expanded state:", err);
    }
    // Notify the dashboard layout so it can adjust the main content margin
    window.dispatchEvent(new CustomEvent("schoolpilot-chat-toggle"));
  }, [isExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PERSONALITY, personality);
    } catch (err) {
      console.warn("Failed to persist personality preference:", err);
    }
  }, [personality]);

  // ---- Auto-scroll to bottom on new content ----
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // ---- Close personality picker on outside click ----
  useEffect(() => {
    if (!showPersonalityPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        personalityPickerRef.current &&
        !personalityPickerRef.current.contains(e.target as Node)
      ) {
        setShowPersonalityPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPersonalityPicker]);

  // ---- Listen for external toggle events (from MobileNav / Sidebar chat buttons) ----
  useEffect(() => {
    const handleToggle = () => setIsExpanded((prev) => !prev);
    window.addEventListener("toggle-chat", handleToggle);
    return () => window.removeEventListener("toggle-chat", handleToggle);
  }, []);

  // ---- Listen for open-chat events with optional pre-filled message ----
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handleOpen = (e: Event) => {
      setIsExpanded(true);
      setShowConversations(false);
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        timeoutId = setTimeout(() => {
          sendMessageRef.current?.(detail.message);
          timeoutId = null;
        }, 400);
      }
    };
    window.addEventListener("open-chat", handleOpen);
    return () => {
      window.removeEventListener("open-chat", handleOpen);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // ---- Focus input when sidebar opens ----
  useEffect(() => {
    if (isExpanded && !showConversations) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isExpanded, showConversations]);

  // =========================================================================
  // API helpers
  // =========================================================================

  const loadConversations = useCallback(async () => {
    try {
      const data = await backendFetch<Conversation[]>("/api/chat/conversations");
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("Failed to load conversations:", err);
      setConversations([]);
    }
  }, []);

  // ---- Load conversations when sidebar expands ----
  useEffect(() => {
    if (isExpanded) {
      loadConversations();
    }
  }, [isExpanded, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const data = await backendFetch<ChatMessageData[]>(
        `/api/chat/conversations/${conversationId}/messages`
      );
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load messages for conversation:", err);
      setMessages([]);
    }
  }, []);

  const selectConversation = useCallback(
    async (conv: Conversation) => {
      setActiveConversationId(conv.id);
      setShowConversations(false);
      setError("");
      await loadMessages(conv.id);
    },
    [loadMessages]
  );

  const startNewChat = useCallback(() => {
    // Abort any in-flight stream
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;

    setActiveConversationId(null);
    setMessages([]);
    setStreamingText("");
    setStreamingActions([]);
    setInput("");
    setError("");
    setIsLoading(false);
    setShowConversations(false);
    inputRef.current?.focus();
  }, []);

  const deleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await backendFetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          startNewChat();
        }
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [activeConversationId, startNewChat]
  );

  // =========================================================================
  // Send message with SSE streaming
  // =========================================================================

  const sendMessage = useCallback(
    async (text?: string) => {
      const messageText = (text || input).trim();
      if (!messageText || isLoading) return;

      setInput("");
      setError("");
      setIsLoading(true);
      setStreamingText("");
      setStreamingActions([]);

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }

      // Track chat usage
      try {
        const { trackEvent } = await import("@/components/PostHogProvider");
        trackEvent("chat_sent", { message_length: messageText.length });
      } catch {}

      // Optimistically add user message to the list
      const userMessage: ChatMessageData = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: messageText,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Start streaming
      const stream = apiStream("/api/chat/send", {
        conversation_id: activeConversationId,
        message: messageText,
        personality,
      });
      streamControllerRef.current = stream;

      let accumulatedText = "";
      let accumulatedActions: ActionTaken[] = [];
      let receivedConvId = activeConversationId;

      try {
        for await (const event of stream) {
          switch (event.type) {
            case "conversation_id":
              receivedConvId = (event as Extract<SSEEvent, { type: "conversation_id" }>).id;
              setActiveConversationId(receivedConvId);
              break;

            case "text":
              accumulatedText += (event as Extract<SSEEvent, { type: "text" }>).content;
              setStreamingText(accumulatedText);
              break;

            case "action": {
              const actionEvent = event as Extract<SSEEvent, { type: "action" }>;
              accumulatedActions = [...accumulatedActions, actionEvent.action as ActionTaken];
              setStreamingActions(accumulatedActions);
              break;
            }

            case "error":
              setError((event as Extract<SSEEvent, { type: "error" }>).message);
              break;

            case "done":
              // Stream complete
              break;
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Chat stream error:", err);
        }
      }

      // Finalize: commit the streamed content as a real message
      if (accumulatedText || accumulatedActions.length > 0) {
        const assistantMessage: ChatMessageData = {
          id: `temp-assistant-${Date.now()}`,
          role: "assistant",
          content: accumulatedText,
          actions_taken: accumulatedActions.length > 0 ? accumulatedActions : null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      setStreamingText("");
      setStreamingActions([]);
      setIsLoading(false);
      streamControllerRef.current = null;

      // Refresh conversation list (the backend may have auto-created one)
      loadConversations();
    },
    [input, isLoading, activeConversationId, personality, loadConversations]
  );

  // Keep ref in sync so event listeners can call sendMessage without stale closures
  sendMessageRef.current = sendMessage;

  // =========================================================================
  // Keyboard & input handlers
  // =========================================================================

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  };

  // =========================================================================
  // Derived values
  // =========================================================================

  const currentPersonality = PERSONALITIES.find((p) => p.id === personality) || PERSONALITIES[0];
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const conversationTitle = activeConversation?.title || "New Chat";
  const hasInput = input.trim().length > 0;

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <>
      {/* ---- Toggle button (always visible on the right edge) ---- */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 w-8 h-16 flex items-center justify-center rounded-l-lg transition-all duration-300 ${
          isExpanded
            ? "bg-surface border border-r-0 border-border hover:bg-surface-hover"
            : "bg-accent hover:bg-accent/80 shadow-lg shadow-accent/20"
        }`}
        aria-label={isExpanded ? "Collapse chat" : "Open chat"}
        title={isExpanded ? "Collapse chat" : "Open chat"}
      >
        <svg
          className={`w-4 h-4 text-white transition-transform duration-300 ${
            isExpanded ? "rotate-0" : "rotate-180"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* ---- Sidebar panel ---- */}
      <aside
        className={`fixed right-0 top-0 h-screen z-30 flex flex-col bg-bg border-l border-border transition-all duration-300 ease-in-out ${
          isExpanded ? "w-full sm:w-[400px] translate-x-0" : "w-full sm:w-[400px] translate-x-full"
        }`}
        aria-label="Chat sidebar"
        role="complementary"
      >
        {/* ============================================================= */}
        {/* HEADER                                                        */}
        {/* ============================================================= */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile close button */}
            <button
              onClick={() => setIsExpanded(false)}
              className="sm:hidden p-1 rounded-md hover:bg-surface-hover text-muted hover:text-text transition-colors shrink-0 mr-0.5"
              aria-label="Close chat"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* Back arrow -- shown when viewing a conversation */}
            {(activeConversationId || messages.length > 0) && !showConversations && (
              <button
                onClick={() => {
                  setShowConversations(true);
                  loadConversations();
                }}
                className="p-1 rounded-md hover:bg-surface-hover text-muted hover:text-text transition-colors shrink-0"
                aria-label="Back to conversations"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {/* ThinkingOrb + title */}
            {!showConversations && !(activeConversationId || messages.length > 0) && (
              <ThinkingOrb />
            )}
            <h2 className="text-sm font-semibold text-text truncate">
              {showConversations ? "Conversations" : conversationTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Personality picker */}
            <div className="relative" ref={personalityPickerRef}>
              <button
                onClick={() => setShowPersonalityPicker(!showPersonalityPicker)}
                className="p-1.5 rounded-md hover:bg-surface-hover text-muted hover:text-text transition-colors flex items-center gap-1.5"
                aria-label={`Personality: ${currentPersonality.name}`}
                title={`Personality: ${currentPersonality.name}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: currentPersonality.color }}
                />
                <span className="text-xs text-text-secondary hidden sm:inline">
                  {currentPersonality.name}
                </span>
              </button>

              {/* Dropdown */}
              {showPersonalityPicker && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 pt-2.5 pb-1.5">
                    <p className="text-[11px] font-medium text-dim uppercase tracking-wider">
                      AI Personality
                    </p>
                  </div>
                  {PERSONALITIES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPersonality(p.id);
                        setShowPersonalityPicker(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        personality === p.id
                          ? "bg-accent/10 text-accent-light"
                          : "text-text-secondary hover:bg-surface-hover hover:text-text"
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{p.name}</p>
                        <p className="text-[11px] text-dim">{p.description}</p>
                      </div>
                      {personality === p.id && (
                        <svg
                          className="w-3.5 h-3.5 text-accent-light ml-auto shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New chat button */}
            <button
              onClick={startNewChat}
              className="p-1.5 rounded-md hover:bg-surface-hover text-muted hover:text-text transition-colors"
              aria-label="New chat"
              title="New chat"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Collapse button (desktop) */}
            <button
              onClick={() => setIsExpanded(false)}
              className="hidden sm:flex p-1.5 rounded-md hover:bg-surface-hover text-muted hover:text-text transition-colors"
              aria-label="Collapse chat"
              title="Collapse chat"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* CONVERSATIONS LIST                                            */}
        {/* ============================================================= */}
        {showConversations ? (
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-surface-hover flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-text-secondary text-sm mb-1">No conversations yet</p>
                <p className="text-muted text-xs mb-4">Start chatting to create one.</p>
                <button
                  onClick={startNewChat}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-medium transition-colors"
                >
                  New Chat
                </button>
              </div>
            ) : (
              <div className="py-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectConversation(conv)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectConversation(conv);
                      }
                    }}
                    className={`group flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                      conv.id === activeConversationId
                        ? "bg-accent-glow border-l-2 border-accent"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="text-sm text-text font-medium truncate">
                        {conv.title || "Untitled"}
                      </p>
                      <p className="text-[11px] text-dim mt-0.5">
                        {formatRelativeDate(conv.updated_at || conv.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red/10 text-dim hover:text-red transition-all shrink-0"
                      aria-label={`Delete conversation: ${conv.title || "Untitled"}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ========================================================= */}
            {/* MESSAGES AREA                                              */}
            {/* ========================================================= */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* Empty state */}
              {messages.length === 0 && !streamingText && !isLoading && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-light mb-4 animate-[breathe_2s_ease-in-out_infinite]" />
                  <p className="text-text font-medium text-sm mb-1">
                    Hey! I&apos;m SchoolPilot.
                  </p>
                  <p className="text-muted text-xs leading-relaxed max-w-[260px]">
                    Your AI study companion. Ask me about your assignments, grades,
                    or anything school-related.
                  </p>
                </div>
              )}

              {/* Rendered messages */}
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {/* Streaming assistant message (appears while SSE is active) */}
              {(streamingText || streamingActions.length > 0) && (
                <ChatMessage
                  message={{
                    id: "streaming",
                    role: "assistant",
                    content: streamingText,
                    actions_taken:
                      streamingActions.length > 0 ? streamingActions : null,
                  }}
                  isStreaming
                />
              )}

              {/* Thinking state (shown before the stream starts) */}
              {isLoading && !streamingText && streamingActions.length === 0 && (
                <div className="flex items-start gap-2.5 mb-4">
                  <div className="w-7 h-7 shrink-0">
                    <ThinkingOrb />
                  </div>
                  <div className="pt-1.5">
                    <ThinkingDots />
                    <p className="text-[11px] text-dim mt-1.5">Thinking...</p>
                  </div>
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="mx-1 mb-3 p-2.5 rounded-lg bg-red/5 border border-red/20">
                  <p className="text-xs text-red">{error}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ========================================================= */}
            {/* QUICK ACTIONS (prominent when empty, compact otherwise)    */}
            {/* ========================================================= */}
            {messages.length === 0 && !isLoading && (
              <div className="px-4 py-2 border-t border-border shrink-0">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action}
                      onClick={() => sendMessage(action)}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-full border border-border text-muted text-xs hover:border-border-light hover:text-text transition-colors disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* INPUT AREA                                                 */}
            {/* ========================================================= */}
            <div className="px-3 py-3 border-t border-border shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything..."
                  rows={1}
                  disabled={isLoading}
                  className="flex-1 resize-none bg-bg border border-border rounded-[10px] px-3 py-2.5 text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-50 max-h-[120px]"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !hasInput}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
                    hasInput
                      ? "bg-accent text-text hover:bg-accent/80"
                      : "bg-transparent border border-border text-dim"
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                  aria-label="Send message"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                    />
                  </svg>
                </button>
              </div>

              {/* Compact quick actions below input when messages exist */}
              {messages.length > 0 && !isLoading && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action}
                      onClick={() => sendMessage(action)}
                      disabled={isLoading}
                      className="px-2 py-1 rounded-full border border-border/60 text-dim text-[11px] hover:border-border-light hover:text-text-secondary transition-colors disabled:opacity-50"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return "yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (err) {
    console.warn("Failed to format relative date:", err);
    return "";
  }
}

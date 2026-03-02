// ChatSidebar.tsx — Streaming AI chat sidebar component.
// Lives on the right side of the dashboard. Supports SSE streaming, tool-use
// action cards, personality presets, conversation history, and quick actions.

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { backendFetch, apiStream, type SSEEvent } from "@/lib/api";
import ChatMessage, { type ChatMessageData, type ActionTaken } from "@/components/ChatMessage";

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
}

const PERSONALITIES: Personality[] = [
  { id: "coach", name: "Coach", description: "Direct and motivating" },
  { id: "friend", name: "Friend", description: "Chill and supportive" },
  { id: "mentor", name: "Mentor", description: "Wise and thoughtful" },
  { id: "drill_sergeant", name: "Drill Sergeant", description: "No excuses" },
];

const PERSONALITY_ICONS: Record<string, string> = {
  coach: "\u{1F3C8}",
  friend: "\u{1F91D}",
  mentor: "\u{1F9D1}\u200D\u{1F393}",
  drill_sergeant: "\u{1F4AA}",
};

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

  // ---- Persist expand state and personality via localStorage ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXPANDED);
      if (saved !== null) setIsExpanded(saved === "true");
      const savedPers = localStorage.getItem(STORAGE_KEY_PERSONALITY);
      if (savedPers && PERSONALITIES.some((p) => p.id === savedPers)) {
        setPersonality(savedPers);
      }
    } catch {
      // localStorage unavailable (SSR / incognito)
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXPANDED, String(isExpanded));
    } catch {
      // ignore
    }
    // Notify the dashboard layout so it can adjust the main content margin
    window.dispatchEvent(new CustomEvent("schoolpilot-chat-toggle"));
  }, [isExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PERSONALITY, personality);
    } catch {
      // ignore
    }
  }, [personality]);

  // ---- Load conversations when sidebar expands ----
  useEffect(() => {
    if (isExpanded) {
      loadConversations();
    }
  }, [isExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const handleOpen = (e: Event) => {
      setIsExpanded(true);
      setShowConversations(false);
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        // Small delay to let the sidebar render, then send the message
        setTimeout(() => {
          sendMessage(detail.message);
        }, 400);
      }
    };
    window.addEventListener("open-chat", handleOpen);
    return () => window.removeEventListener("open-chat", handleOpen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch {
      // Conversations list is non-critical — fail silently
      setConversations([]);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const data = await backendFetch<ChatMessageData[]>(
        `/api/chat/conversations/${conversationId}/messages`
      );
      setMessages(Array.isArray(data) ? data : []);
    } catch {
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
      } catch {
        // ignore
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
      } catch {
        // Stream aborted or network error — already handled above
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
            ? "bg-bg-card border border-r-0 border-border hover:bg-bg-hover"
            : "bg-accent hover:bg-accent-hover shadow-lg shadow-accent/20"
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
        className={`fixed right-0 top-0 h-screen z-30 flex flex-col bg-bg-card border-l border-border transition-all duration-300 ease-in-out ${
          isExpanded ? "w-[400px] translate-x-0" : "w-[400px] translate-x-full"
        }`}
        aria-label="Chat sidebar"
        role="complementary"
      >
        {/* ============================================================= */}
        {/* HEADER                                                        */}
        {/* ============================================================= */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Back arrow — shown when viewing a conversation */}
            {(activeConversationId || messages.length > 0) && !showConversations && (
              <button
                onClick={() => {
                  setShowConversations(true);
                  loadConversations();
                }}
                className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-white transition-colors shrink-0"
                aria-label="Back to conversations"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-sm font-semibold text-white truncate">
              {showConversations ? "Conversations" : conversationTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Personality picker */}
            <div className="relative" ref={personalityPickerRef}>
              <button
                onClick={() => setShowPersonalityPicker(!showPersonalityPicker)}
                className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-white transition-colors text-base leading-none"
                aria-label={`Personality: ${currentPersonality.name}`}
                title={`Personality: ${currentPersonality.name}`}
              >
                {PERSONALITY_ICONS[personality] || PERSONALITY_ICONS.coach}
              </button>

              {/* Dropdown */}
              {showPersonalityPicker && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-bg-card border border-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-3 pt-2.5 pb-1.5">
                    <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
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
                          ? "bg-accent/10 text-accent"
                          : "text-text-secondary hover:bg-bg-hover hover:text-white"
                      }`}
                    >
                      <span className="text-base shrink-0 leading-none">
                        {PERSONALITY_ICONS[p.id]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{p.name}</p>
                        <p className="text-[11px] text-text-muted">{p.description}</p>
                      </div>
                      {personality === p.id && (
                        <svg
                          className="w-3.5 h-3.5 text-accent ml-auto shrink-0"
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
              className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-white transition-colors"
              aria-label="New chat"
              title="New chat"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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
                <div className="w-10 h-10 rounded-xl bg-bg-hover flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-text-muted text-sm mb-1">No conversations yet</p>
                <p className="text-text-muted text-xs mb-4">Start chatting to create one.</p>
                <button
                  onClick={startNewChat}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
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
                        ? "bg-accent/10 border-r-2 border-accent"
                        : "hover:bg-bg-hover"
                    }`}
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="text-sm text-white font-medium truncate">
                        {conv.title || "Untitled"}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {formatRelativeDate(conv.updated_at || conv.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-error/20 text-text-muted hover:text-error transition-all shrink-0"
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
            <div className="flex-1 overflow-y-auto bg-bg-dark px-3 py-3">
              {/* Empty state */}
              {messages.length === 0 && !streamingText && !isLoading && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-3">
                    <svg
                      className="w-6 h-6 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                      />
                    </svg>
                  </div>
                  <p className="text-white font-medium text-sm mb-1">
                    Hey! I&apos;m SchoolPilot.
                  </p>
                  <p className="text-text-muted text-xs leading-relaxed max-w-[260px]">
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

              {/* Loading dots (shown before the stream starts) */}
              {isLoading && !streamingText && streamingActions.length === 0 && (
                <div className="flex justify-start mb-3">
                  <div className="bg-bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" />
                      <span
                        className="w-1.5 h-1.5 bg-text-muted rounded-full animate-[pulse_1.4s_ease-in-out_infinite]"
                        style={{ animationDelay: "0.2s" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-text-muted rounded-full animate-[pulse_1.4s_ease-in-out_infinite]"
                        style={{ animationDelay: "0.4s" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="mx-1 mb-3 p-2.5 rounded-lg bg-error/10 border border-error/20">
                  <p className="text-xs text-error">{error}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* ========================================================= */}
            {/* QUICK ACTIONS (prominent when empty, compact otherwise)    */}
            {/* ========================================================= */}
            {messages.length === 0 && !isLoading && (
              <div className="px-3 py-2 border-t border-border bg-bg-card shrink-0">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action}
                      onClick={() => sendMessage(action)}
                      disabled={isLoading}
                      className="px-2.5 py-1.5 rounded-lg bg-bg-hover text-text-secondary text-xs hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
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
            <div className="px-3 py-3 border-t border-border bg-bg-card shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything..."
                  rows={1}
                  disabled={isLoading}
                  className="flex-1 resize-none bg-bg-dark border border-border rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors disabled:opacity-50 max-h-[120px]"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !input.trim()}
                  className="p-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
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
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
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
                      className="px-2 py-1 rounded-md bg-bg-hover/50 text-text-muted text-[11px] hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
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
  } catch {
    return "";
  }
}

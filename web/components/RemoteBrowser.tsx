"use client";

// RemoteBrowser — Interactive remote Playwright browser for LMS login.
// Renders a live screenshot stream via WebSocket. Student clicks/types
// to drive the browser, then clicks "Save session" to capture cookies.

import { createClient } from "@/lib/supabase-client";
import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RemoteBrowserProps {
  onComplete: () => void;
  onError: (msg: string) => void;
}

type Status = "idle" | "connecting" | "connected" | "done" | "error";

export default function RemoteBrowser({ onComplete, onError }: RemoteBrowserProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [typingText, setTypingText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport dimensions matching Playwright
  const VIEWPORT_W = 1280;
  const VIEWPORT_H = 900;

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startSession = useCallback(async () => {
    setStatus("connecting");
    setStatusMessage("Starting secure browser...");
    setErrorMsg("");
    setScreenshot(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus("error");
        setErrorMsg("Not authenticated. Please sign in again.");
        onError("Not authenticated");
        return;
      }

      // Start session
      const res = await fetch(`${API_URL}/api/agent/remote-browser/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to start browser session" }));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const { session_id } = await res.json();

      // Connect WebSocket
      const wsUrl = API_URL.replace(/^http/, "ws") + `/api/agent/remote-browser/ws/${session_id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        setStatusMessage("Connected — log into your LMS below");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "screenshot") {
            setScreenshot(`data:image/jpeg;base64,${msg.data}`);
            if (msg.url) setCurrentUrl(msg.url);
          } else if (msg.type === "status") {
            setStatusMessage(msg.message || "");
          } else if (msg.type === "done") {
            setStatus("done");
            setStatusMessage("LMS connected successfully!");
            cleanup();
            onComplete();
          } else if (msg.type === "error") {
            setErrorMsg(msg.message || "An error occurred");
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setStatus("error");
        setErrorMsg("Connection lost. Please try again.");
        onError("WebSocket error");
      };

      ws.onclose = () => {
        if (status !== "done") {
          // Only set error if we didn't complete successfully
          // Use a ref check since state may be stale in closure
        }
      };
    } catch (e) {
      setStatus("error");
      const msg = e instanceof Error ? e.message : "Failed to start browser session";
      setErrorMsg(msg);
      onError(msg);
    }
  }, [cleanup, onComplete, onError, status]);

  // Auto-start on mount
  useEffect(() => {
    if (status === "idle") {
      startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Handle click on the browser image
  const handleClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = VIEWPORT_W / rect.width;
    const scaleY = VIEWPORT_H / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    sendMessage({ type: "click", x, y });
  }, [sendMessage]);

  // Send typed text
  const handleSendText = useCallback(() => {
    if (!typingText.trim()) return;
    sendMessage({ type: "type", text: typingText });
    setTypingText("");
  }, [typingText, sendMessage]);

  // Handle Enter in the text input
  const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendText();
    }
  }, [handleSendText]);

  // Send keyboard key
  const handleKeyPress = useCallback((key: string) => {
    sendMessage({ type: "key", key });
  }, [sendMessage]);

  // Save session (done)
  const handleDone = useCallback(() => {
    sendMessage({ type: "done" });
    setStatusMessage("Saving your session...");
  }, [sendMessage]);

  // Retry
  const handleRetry = useCallback(() => {
    cleanup();
    setStatus("idle");
    setErrorMsg("");
    startSession();
  }, [cleanup, startSession]);

  // Done state
  if (status === "done") {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-success/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white">LMS Connected Successfully!</h3>
        <p className="text-text-secondary text-sm">Your session has been saved. We can now sync your assignments automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center gap-2">
        {status === "connecting" && (
          <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
        )}
        {status === "connected" && (
          <div className="w-2 h-2 rounded-full bg-success" />
        )}
        {status === "error" && (
          <div className="w-2 h-2 rounded-full bg-error" />
        )}
        <span className="text-text-secondary text-sm">{statusMessage}</span>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            onClick={handleRetry}
            className="ml-3 px-3 py-1 rounded-lg bg-error/20 hover:bg-error/30 text-error text-xs font-medium transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Browser view */}
      {(status === "connecting" || status === "connected") && (
        <>
          {/* Fake URL bar */}
          {currentUrl && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl bg-bg-dark border border-border border-b-0">
              <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              <span className="text-text-muted text-xs truncate">{currentUrl}</span>
            </div>
          )}

          {/* Screenshot container */}
          <div
            ref={containerRef}
            className={`relative bg-bg-dark border border-border overflow-hidden ${currentUrl ? "rounded-b-xl" : "rounded-xl"}`}
            style={{ aspectRatio: `${VIEWPORT_W} / ${VIEWPORT_H}` }}
          >
            {screenshot ? (
              <img
                ref={imgRef}
                src={screenshot}
                alt="Remote browser view"
                className="w-full h-full object-contain cursor-crosshair"
                onClick={handleClick}
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-text-muted text-sm">Loading browser...</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-3">
            {/* Text input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={typingText}
                onChange={(e) => setTypingText(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder="Type text here, then press Send..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-bg-card border border-border text-white placeholder:text-text-muted focus:outline-none focus:border-accent text-sm"
              />
              <button
                onClick={handleSendText}
                disabled={!typingText.trim()}
                className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                Send
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleKeyPress("Enter")}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-white hover:border-accent/30 text-xs font-medium transition-colors cursor-pointer"
              >
                Press Enter
              </button>
              <button
                onClick={() => handleKeyPress("Tab")}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-white hover:border-accent/30 text-xs font-medium transition-colors cursor-pointer"
              >
                Press Tab
              </button>
              <button
                onClick={() => handleKeyPress("Escape")}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-white hover:border-accent/30 text-xs font-medium transition-colors cursor-pointer"
              >
                Press Esc
              </button>
              <button
                onClick={() => sendMessage({ type: "scroll", direction: "down", amount: 300 })}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-white hover:border-accent/30 text-xs font-medium transition-colors cursor-pointer"
              >
                Scroll Down
              </button>
              <button
                onClick={() => sendMessage({ type: "scroll", direction: "up", amount: 300 })}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-white hover:border-accent/30 text-xs font-medium transition-colors cursor-pointer"
              >
                Scroll Up
              </button>
            </div>

            {/* Save session button */}
            <button
              onClick={handleDone}
              className="w-full py-3 rounded-xl bg-success/20 hover:bg-success/30 border border-success/30 text-success font-semibold text-sm transition-colors cursor-pointer"
            >
              I&apos;m logged in — Save session
            </button>
          </div>

          {/* Help text */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-bg-card/50 border border-border/50">
            <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <p className="text-text-muted text-xs leading-relaxed">
              Click directly on the browser image to interact. Use the text field below to type passwords or emails.
              Once you see your LMS dashboard, click &quot;I&apos;m logged in&quot; to save your session.
            </p>
          </div>
        </>
      )}

      {/* Idle / Error with retry */}
      {status === "error" && !screenshot && (
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-error/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white">Connection Failed</h3>
          <p className="text-text-secondary text-sm">{errorMsg || "Unable to start browser session."}</p>
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

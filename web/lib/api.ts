// API helpers for calling Next.js API routes (proxy to Flask) and the new
// FastAPI backend directly.  Includes streaming SSE support for the chat engine.

import { createClient } from "@/lib/supabase-client";

// ---------------------------------------------------------------------------
// Existing proxy helper (used by today page, grades, etc.)
// ---------------------------------------------------------------------------

export async function apiFetch<T = unknown>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`/api/ai/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// New backend helpers (FastAPI at NEXT_PUBLIC_API_URL)
// ---------------------------------------------------------------------------

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Get a valid Supabase access token for the current session.
 * Returns null if the user is not signed in.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated fetch to the FastAPI backend.
 *
 * Automatically injects the Supabase Bearer token and handles JSON
 * parsing.  Throws on non-2xx responses with a human-readable message.
 */
export async function backendFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Not signed in. Please log in and try again.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const err = await res.json();
      if (err.detail) message = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      else if (err.error) message = err.error;
    } catch {
      // response body wasn't JSON — use the status text
      message = res.statusText || message;
    }
    throw new Error(message);
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// SSE streaming interface
// ---------------------------------------------------------------------------

/** Events emitted by the SSE stream. */
export type SSEEvent =
  | { type: "text"; content: string }
  | { type: "action"; action: { tool: string; input: Record<string, unknown>; result: Record<string, unknown> } }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "conversation_id"; id: string };

export interface StreamController {
  /** Async iterator — use `for await (const event of stream)` */
  [Symbol.asyncIterator](): AsyncIterableIterator<SSEEvent>;
  /** Abort the stream early. */
  abort(): void;
}

/**
 * POST to a backend endpoint and return an SSE stream.
 *
 * Usage:
 * ```ts
 * const stream = apiStream("/api/chat/send", { message: "hi" });
 * for await (const event of stream) {
 *   if (event.type === "text") appendText(event.content);
 *   if (event.type === "done") break;
 * }
 * ```
 */
export function apiStream(path: string, body: object): StreamController {
  const abortController = new AbortController();

  async function* iterate(): AsyncGenerator<SSEEvent, void, undefined> {
    const token = await getAccessToken();
    if (!token) {
      yield { type: "error", message: "Not signed in. Please log in and try again." };
      yield { type: "done" };
      return;
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      yield { type: "error", message: "Cannot reach the AI service. Check your connection." };
      yield { type: "done" };
      return;
    }

    // Emit the conversation ID from the response header if present
    const convId = res.headers.get("X-Conversation-Id");
    if (convId) {
      yield { type: "conversation_id", id: convId };
    }

    if (!res.ok) {
      let message = `Server error: ${res.status}`;
      try {
        const errBody = await res.json();
        message = errBody.detail || errBody.error || message;
      } catch {
        // ignore
      }
      yield { type: "error", message };
      yield { type: "done" };
      return;
    }

    if (!res.body) {
      yield { type: "error", message: "No response body received." };
      yield { type: "done" };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE format: lines starting with "data: " terminated by double newline
        const lines = buffer.split("\n");
        buffer = "";

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // If this is the last line and doesn't end with \n, it's incomplete
          if (i === lines.length - 1 && !line.endsWith("")) {
            // Actually check if the original buffer ended with \n
            // Keep incomplete lines in the buffer
          }

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const event = JSON.parse(jsonStr) as SSEEvent;
              yield event;
              if (event.type === "done") return;
            } catch {
              // Partial JSON — put it back in the buffer
              buffer = line + "\n";
            }
          } else if (line.trim() === "" || line.startsWith(":")) {
            // Empty line (event separator) or comment — skip
            continue;
          } else {
            // Might be a continuation or partial line
            buffer += line + "\n";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      yield { type: "error", message: "Stream interrupted. Please try again." };
    } finally {
      reader.releaseLock();
    }

    // If we exited the loop without a "done" event, emit one
    yield { type: "done" };
  }

  return {
    [Symbol.asyncIterator]() {
      return iterate();
    },
    abort() {
      abortController.abort();
    },
  };
}

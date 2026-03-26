// ChatMessage.tsx — Renders individual chat messages with rich content support.
// Handles user messages (right-aligned, surface bg), assistant messages (left-aligned,
// no bg, with ThinkingOrb avatar), markdown formatting, and inline action cards.

"use client";

import { useMemo } from "react";
import { StreamingCursor } from "@/components/ui/Loading";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionTaken {
  tool: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions_taken?: ActionTaken[] | null;
  created_at?: string;
}

interface ChatMessageProps {
  message: ChatMessageData;
  isStreaming?: boolean;
}

// ---------------------------------------------------------------------------
// Markdown-lite renderer
// ---------------------------------------------------------------------------

/**
 * Converts a subset of markdown to React elements.
 * Handles: **bold**, *italic*, `code`, headers (## / ###),
 * bullet lists (- item), numbered lists (1. item), and line breaks.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  // First, handle fenced code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let processedText = text;
  const codeBlocks: { placeholder: string; lang: string; code: string }[] = [];
  let codeMatch;
  let codeIndex = 0;
  while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
    const placeholder = `__CODE_BLOCK_${codeIndex}__`;
    codeBlocks.push({ placeholder, lang: codeMatch[1], code: codeMatch[2].trimEnd() });
    processedText = processedText.replace(codeMatch[0], placeholder);
    codeIndex++;
  }

  const lines = processedText.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag
          key={`list-${key++}`}
          className={`${listType === "ul" ? "list-disc" : "list-decimal"} pl-4 space-y-0.5 my-1`}
        >
          {listItems}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 key={`h4-${key++}`} className="text-[13px] font-semibold text-text mt-2.5 mb-0.5">
          {formatInline(trimmed.slice(4))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={`h3-${key++}`} className="text-[13px] font-semibold text-text mt-2.5 mb-0.5">
          {formatInline(trimmed.slice(3))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h2 key={`h2-${key++}`} className="text-sm font-semibold text-text mt-2.5 mb-1">
          {formatInline(trimmed.slice(2))}
        </h2>
      );
      continue;
    }

    // Code block placeholder
    const codeBlock = codeBlocks.find(cb => trimmed === cb.placeholder);
    if (codeBlock) {
      flushList();
      elements.push(
        <pre key={`pre-${key++}`} className="bg-bg rounded-lg p-3 my-2 overflow-x-auto border border-border">
          <code className="text-xs text-text-secondary font-mono whitespace-pre">
            {codeBlock.code}
          </code>
        </pre>
      );
      continue;
    }

    // Bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(
        <li key={`li-${key++}`} className="text-text-secondary text-[13px] leading-relaxed">
          {formatInline(trimmed.slice(2))}
        </li>
      );
      continue;
    }

    // Numbered list
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(
        <li key={`li-${key++}`} className="text-text-secondary text-[13px] leading-relaxed">
          {formatInline(numberedMatch[2])}
        </li>
      );
      continue;
    }

    // Regular text or empty line
    flushList();

    if (trimmed === "") {
      elements.push(<div key={`br-${key++}`} className="h-1.5" />);
    } else {
      elements.push(
        <p key={`p-${key++}`} className="text-text-secondary text-[13px] leading-relaxed">
          {formatInline(trimmed)}
        </p>
      );
    }
  }

  flushList();
  return elements;
}

/**
 * Process inline formatting: **bold**, *italic*, `code`.
 */
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let partKey = 0;

  while (remaining.length > 0) {
    // Link: [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)/s);
    if (linkMatch) {
      if (linkMatch[1]) parts.push(processCode(linkMatch[1], partKey++));
      parts.push(
        <a key={`link-${partKey++}`} href={linkMatch[3]} target="_blank" rel="noopener noreferrer" className="text-accent-light hover:underline">
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4];
      continue;
    }

    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(processCode(boldMatch[1], partKey++));
      parts.push(
        <strong key={`b-${partKey++}`} className="font-semibold text-text">
          {processCode(boldMatch[2], partKey++)}
        </strong>
      );
      remaining = boldMatch[3];
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(processCode(italicMatch[1], partKey++));
      parts.push(
        <em key={`i-${partKey++}`} className="italic text-text-secondary">
          {processCode(italicMatch[2], partKey++)}
        </em>
      );
      remaining = italicMatch[3];
      continue;
    }

    // No more inline formatting -- process code spans in remainder
    parts.push(processCode(remaining, partKey++));
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Process inline code: `code`.
 */
function processCode(text: string | React.ReactNode, baseKey: number): React.ReactNode {
  if (typeof text !== "string") return text;

  const segments: React.ReactNode[] = [];
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }
    segments.push(
      <code
        key={`code-${baseKey}-${match.index}`}
        className="px-1.5 py-0.5 rounded-[4px] bg-bg text-accent-light text-xs font-mono border border-border"
      >
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return segments.length === 1 ? segments[0] : <>{segments}</>;
}

// ---------------------------------------------------------------------------
// Action card renderers
// ---------------------------------------------------------------------------

function ReminderCard({ action }: { action: ActionTaken }) {
  const title = (action.input.title as string) || "Reminder";
  const remindAt = action.result.remind_at as string | undefined;
  let timeStr = "";
  if (remindAt) {
    try {
      const d = new Date(remindAt);
      timeStr = d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      timeStr = remindAt;
    }
  }

  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface border border-border mt-2">
      <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
        <ClockIcon />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text">{title}</p>
        {timeStr && <p className="text-[11px] text-muted mt-0.5">{timeStr}</p>}
      </div>
    </div>
  );
}

function ProfileUpdateCard({ action }: { action: ActionTaken }) {
  const field = (action.input.field as string) || "profile";
  const value = action.result.current_value;
  const display = typeof value === "string" ? value : JSON.stringify(value);

  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface border border-border mt-2">
      <div className="w-6 h-6 rounded-full bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
        <CheckIcon />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text">Updated {field}</p>
        <p className="text-[11px] text-muted mt-0.5 truncate" title={display}>
          {display.length > 80 ? display.slice(0, 80) + "..." : display}
        </p>
      </div>
    </div>
  );
}

function GradeAnalysisCard({ action }: { action: ActionTaken }) {
  const course = (action.result.course as string) || (action.input.course_name as string) || "Course";
  const grade = action.result.overall_grade as string | undefined;
  const pct = action.result.percentage as number | undefined;

  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface border border-border mt-2">
      <div className="w-6 h-6 rounded-full bg-amber/10 flex items-center justify-center shrink-0 mt-0.5">
        <ChartIcon />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text">{course}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {grade && <span className="text-xs font-semibold text-accent-light">{grade}</span>}
          {pct !== undefined && (
            <span className="text-[11px] text-muted">{Math.round(pct * 10) / 10}%</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StudyPlanCard({ action }: { action: ActionTaken }) {
  const assignments = (action.result.upcoming_assignments as Array<{ title: string; course?: string; due?: string }>) || [];
  const focus = (action.result.focus as string) || "Study Plan";

  return (
    <div className="p-2.5 rounded-lg bg-surface border border-border mt-2">
      <p className="text-xs font-medium text-text mb-1.5">
        {focus !== "general" ? focus : "Study Plan"}
      </p>
      {assignments.length > 0 ? (
        <div className="space-y-1">
          {assignments.slice(0, 5).map((a, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary truncate mr-2">{a.title}</span>
              {a.due && (
                <span className="text-muted shrink-0 text-[11px]">
                  {formatDueDate(a.due)}
                </span>
              )}
            </div>
          ))}
          {assignments.length > 5 && (
            <p className="text-[11px] text-muted">+{assignments.length - 5} more</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">No upcoming assignments found.</p>
      )}
    </div>
  );
}

function GenericActionCard({ action }: { action: ActionTaken }) {
  const hasError = !!action.result.error;

  return (
    <div
      className={`flex items-start gap-2.5 p-2.5 rounded-lg mt-2 ${
        hasError ? "bg-red/5 border border-red/20" : "bg-surface border border-border"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          hasError ? "bg-red/10" : "bg-surface-hover"
        }`}
      >
        {hasError ? <ErrorIcon /> : <ToolIcon />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text">{action.tool.replace(/_/g, " ")}</p>
        {hasError && (
          <p className="text-xs text-red mt-0.5">{action.result.error as string}</p>
        )}
        {!hasError && action.result.status != null && (
          <p className="text-[11px] text-muted mt-0.5">{String(action.result.status)}</p>
        )}
      </div>
    </div>
  );
}

function renderActionCard(action: ActionTaken, index: number) {
  const key = `action-${index}`;

  switch (action.tool) {
    case "set_reminder":
      return <ReminderCard key={key} action={action} />;
    case "update_student_profile":
      return <ProfileUpdateCard key={key} action={action} />;
    case "update_class_context":
      return <ProfileUpdateCard key={key} action={action} />;
    case "get_grade_analysis":
      return <GradeAnalysisCard key={key} action={action} />;
    case "create_study_plan":
      return <StudyPlanCard key={key} action={action} />;
    default:
      return <GenericActionCard key={key} action={action} />;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatDueDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "overdue";
    if (diffDays === 1) return "tomorrow";
    if (diffDays <= 7) return `${diffDays}d`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, no deps)
// ---------------------------------------------------------------------------

function ClockIcon() {
  return (
    <svg className="w-3 h-3 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3 text-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-3 h-3 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-3 h-3 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ToolIcon() {
  return (
    <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";
  const formattedContent = useMemo(
    () => (isUser ? null : renderMarkdown(message.content)),
    [message.content, isUser]
  );

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%] bg-surface rounded-[14px_14px_4px_14px] px-3.5 py-2.5">
          <p className="text-[13px] leading-relaxed text-text whitespace-pre-wrap">
            {message.content}
          </p>
          {message.created_at && !isStreaming && (
            <p className="text-[10px] text-dim mt-1.5 text-right">
              {formatTime(message.created_at)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start gap-2.5 mb-4">
      {/* Avatar: ThinkingOrb-style gradient circle */}
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-accent-light shrink-0 mt-0.5" />

      <div className="max-w-[85%] min-w-0">
        {/* Message content -- no background, just text */}
        {message.content && (
          <div className="space-y-0">
            {formattedContent}
            {isStreaming && <StreamingCursor />}
          </div>
        )}

        {/* Action cards */}
        {message.actions_taken && message.actions_taken.length > 0 && (
          <div className="space-y-1.5">
            {message.actions_taken.map((action, i) => renderActionCard(action, i))}
          </div>
        )}

        {/* Timestamp */}
        {message.created_at && !isStreaming && (
          <p className="text-[10px] text-dim mt-1.5">
            {formatTime(message.created_at)}
          </p>
        )}
      </div>
    </div>
  );
}

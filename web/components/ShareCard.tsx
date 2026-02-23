"use client";

import { useState, useRef, useCallback } from "react";

interface ShareCardProps {
  userName: string;
  tasksCompleted: number;
  streak?: number;
  topCourse?: string;
  grade?: number;
}

export default function ShareCard({
  userName,
  tasksCompleted,
  streak = 0,
  topCourse,
  grade,
}: ShareCardProps) {
  const [copied, setCopied] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const referralLink = typeof window !== "undefined"
    ? `${window.location.origin}?ref=${encodeURIComponent(userName)}`
    : "https://schoolpilot.co";

  const shareText = streak > 0
    ? `${streak}-day streak on SchoolPilot! ${tasksCompleted} tasks done today.`
    : `Just crushed ${tasksCompleted} task${tasksCompleted !== 1 ? "s" : ""} on SchoolPilot.`;

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        `${shareText}\n\nTry it: ${referralLink}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }, [shareText, referralLink]);

  const shareNative = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SchoolPilot",
          text: shareText,
          url: referralLink,
        });
      } catch {
        // User cancelled
      }
    } else {
      copyLink();
    }
  }, [shareText, referralLink, copyLink]);

  if (!showCard) {
    return (
      <button
        onClick={() => setShowCard(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* The visual card */}
        <div
          ref={cardRef}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent via-accent-hover to-[#4c1d95] p-6 text-white"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative space-y-4">
            <div className="text-sm font-medium opacity-80">SchoolPilot</div>

            <div>
              <div className="text-3xl font-bold">
                {tasksCompleted} task{tasksCompleted !== 1 ? "s" : ""} done
              </div>
              {streak > 0 && (
                <div className="text-lg font-medium mt-1 opacity-90">
                  {streak}-day streak
                </div>
              )}
            </div>

            {topCourse && grade && (
              <div className="flex items-center gap-2 text-sm opacity-80">
                <span>{topCourse}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/20 font-medium">
                  {grade}%
                </span>
              </div>
            )}

            <div className="text-xs opacity-60 pt-2">
              {userName} &middot; {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={shareNative}
            className="flex-1 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
          <button
            onClick={copyLink}
            className="flex-1 py-3 rounded-xl bg-bg-card border border-border text-white font-semibold text-sm hover:bg-bg-hover transition-colors flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Copy Link
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => setShowCard(false)}
          className="w-full py-2 text-text-muted text-sm hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

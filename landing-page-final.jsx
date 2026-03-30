import { useState, useEffect, useRef, useCallback } from "react";

// ─── DESIGN TOKENS ──────────────────────────────────────────────
const T = {
  bg: "#09090b",
  surface: "#111113",
  surfaceHover: "#18181b",
  border: "#1e1e22",
  borderLight: "#27272a",
  accent: "#7c3aed",
  accentLight: "#a78bfa",
  accentGlow: "rgba(124, 58, 237, 0.15)",
  text: "#fafafa",
  textSecondary: "#a1a1aa",
  muted: "#71717a",
  dim: "#52525b",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// ─── GLOBAL STYLES (injected once) ──────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { background: ${T.bg}; overflow-x: hidden; }

  @keyframes pulse3 {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.85); }
    40% { opacity: 1; transform: scale(1.15); }
  }
  @keyframes breathe {
    0%, 100% { box-shadow: 0 0 8px ${T.accent}40; }
    50% { box-shadow: 0 0 24px ${T.accent}80; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes scanline {
    0% { left: 0%; }
    50% { left: 100%; }
    100% { left: 0%; }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes gradientMove {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes typewriter {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes cursorBlink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
`;

// ─── HOOKS ──────────────────────────────────────────────────────

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const h = () => setY(window.scrollY);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return y;
}

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// ─── SMALL COMPONENTS ───────────────────────────────────────────

function ThinkingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: T.accentLight,
            animation: `pulse3 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function ThinkingOrb() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
        animation: "breathe 2s ease-in-out infinite",
        flexShrink: 0,
      }}
    />
  );
}

function GlowDivider() {
  return (
    <div
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${T.accent}40, transparent)`,
        animation: "shimmer 3s ease-in-out infinite",
        backgroundSize: "200% 100%",
      }}
    />
  );
}

function Badge({ children, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}18`,
        color: color,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}

// ─── LIVE AI CHAT DEMO ──────────────────────────────────────────

const DEMO_CONVERSATIONS = [
  {
    question: "What do I need on Friday's calc test to keep my A?",
    answer:
      "You're at 91.3% in AP Calculus. With the test weighted at 25%, you need at least an 84% to stay above 90%. Score 90+ and you lock in a solid A going into finals.",
  },
  {
    question: "What should I work on tonight?",
    answer:
      "Three things, in order: 1) English essay draft due tomorrow (biggest grade impact — it's 15% of your grade). 2) Physics problem set (quick win, 30 min). 3) Review your history notes for Thursday's quiz.",
  },
  {
    question: "Am I at risk of dropping in any class?",
    answer:
      "Physics is tight — you're at 89.7%, right on the A/B border. One missed assignment would drop you. Everything else has healthy margins. I'd prioritize Physics submissions this week.",
  },
];

function LiveChatDemo() {
  const [convoIndex, setConvoIndex] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle → typing → thinking → answering → done
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const [inputValue, setInputValue] = useState("");
  const answerRef = useRef("");
  const intervalRef = useRef(null);

  const convo = DEMO_CONVERSATIONS[convoIndex];

  const runDemo = useCallback(
    (idx) => {
      const c = DEMO_CONVERSATIONS[idx];
      setPhase("idle");
      setDisplayedAnswer("");
      setInputValue("");
      answerRef.current = "";

      // Phase 1: type the question
      let qi = 0;
      setPhase("typing");
      const typeInterval = setInterval(() => {
        qi++;
        setInputValue(c.question.slice(0, qi));
        if (qi >= c.question.length) {
          clearInterval(typeInterval);
          // Phase 2: thinking
          setTimeout(() => {
            setPhase("thinking");
            // Phase 3: stream the answer
            setTimeout(() => {
              setPhase("answering");
              let ai = 0;
              intervalRef.current = setInterval(() => {
                ai++;
                answerRef.current = c.answer.slice(0, ai);
                setDisplayedAnswer(answerRef.current);
                if (ai >= c.answer.length) {
                  clearInterval(intervalRef.current);
                  setPhase("done");
                  // Cycle to next conversation
                  setTimeout(() => {
                    const next = (idx + 1) % DEMO_CONVERSATIONS.length;
                    setConvoIndex(next);
                    runDemo(next);
                  }, 4000);
                }
              }, 18);
            }, 2000);
          }, 600);
        }
      }, 45);

      return () => {
        clearInterval(typeInterval);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    },
    []
  );

  useEffect(() => {
    const cleanup = runDemo(0);
    return cleanup;
  }, []);

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        width: "100%",
        maxWidth: 560,
        overflow: "hidden",
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThinkingOrb />
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>SchoolPilot</span>
        </div>
        <span style={{ fontSize: 11, color: T.dim }}>AI Assistant</span>
      </div>

      {/* Messages area */}
      <div style={{ padding: 20, minHeight: 200, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* User message */}
        {(phase === "thinking" || phase === "answering" || phase === "done") && (
          <div style={{ display: "flex", justifyContent: "flex-end", animation: "fadeUp 0.3s ease" }}>
            <div
              style={{
                background: "#1c1c2e",
                color: T.text,
                padding: "10px 16px",
                borderRadius: "14px 14px 4px 14px",
                fontSize: 14,
                lineHeight: 1.5,
                maxWidth: "85%",
              }}
            >
              {convo.question}
            </div>
          </div>
        )}

        {/* Thinking state */}
        {phase === "thinking" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "fadeUp 0.3s ease" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                animation: "breathe 2s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <ThinkingDots />
              <span style={{ fontSize: 11, color: T.dim }}>Looking at your grades...</span>
            </div>
          </div>
        )}

        {/* Streaming answer */}
        {(phase === "answering" || phase === "done") && (
          <div style={{ display: "flex", gap: 10, animation: "fadeUp 0.3s ease" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <div style={{ color: T.textSecondary, fontSize: 14, lineHeight: 1.65 }}>
              {displayedAnswer}
              {phase === "answering" && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 16,
                    background: T.accentLight,
                    marginLeft: 2,
                    verticalAlign: "text-bottom",
                    animation: "cursorBlink 0.8s step-end infinite",
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            flex: 1,
            background: T.bg,
            border: `1px solid ${phase === "typing" ? T.accent + "60" : T.border}`,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            color: phase === "typing" || phase === "thinking" || phase === "answering" || phase === "done" ? T.text : T.dim,
            transition: "border-color 0.3s ease",
            minHeight: 20,
          }}
        >
          {phase === "idle" && "Ask about your classes..."}
          {phase === "typing" && (
            <>
              {inputValue}
              <span
                style={{
                  display: "inline-block",
                  width: 1,
                  height: 14,
                  background: T.text,
                  marginLeft: 1,
                  verticalAlign: "text-bottom",
                  animation: "cursorBlink 0.6s step-end infinite",
                }}
              />
            </>
          )}
          {(phase === "thinking" || phase === "answering" || phase === "done") && convo.question}
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: phase === "typing" ? T.text : T.border,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.3s ease",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke={phase === "typing" ? T.bg : T.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── ANIMATED DASHBOARD ─────────────────────────────────────────

const MOCK_CLASSES = [
  { name: "AP Calculus BC", grade: 91.3, letter: "A", trend: "up", assignments: 3 },
  { name: "English Literature", grade: 87.1, letter: "B+", trend: "up", assignments: 1 },
  { name: "Physics", grade: 89.7, letter: "B+", trend: "down", assignments: 2 },
  { name: "US History", grade: 94.2, letter: "A", trend: "stable", assignments: 1 },
  { name: "Advanced Journalism", grade: 96.8, letter: "A", trend: "up", assignments: 0 },
];

const MOCK_PLAN = [
  { time: "4:00 PM", task: "English essay draft", tag: "Due tomorrow", priority: "high" },
  { time: "5:30 PM", task: "Physics problem set 12", tag: "Quick win", priority: "medium" },
  { time: "7:00 PM", task: "Review history Ch. 14 notes", tag: "Quiz Thursday", priority: "medium" },
];

function AnimatedDashboard() {
  const [ref, visible] = useInView(0.2);
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const timers = [
      setTimeout(() => setRevealStep(1), 200),
      setTimeout(() => setRevealStep(2), 600),
      setTimeout(() => setRevealStep(3), 1000),
      setTimeout(() => setRevealStep(4), 1400),
      setTimeout(() => setRevealStep(5), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  const trendIcon = (t) => {
    if (t === "up") return <span style={{ color: T.green, fontSize: 12 }}>+</span>;
    if (t === "down") return <span style={{ color: T.red, fontSize: 12 }}>-</span>;
    return <span style={{ color: T.dim, fontSize: 12 }}>=</span>;
  };

  return (
    <div
      ref={ref}
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        width: "100%",
        maxWidth: 700,
        overflow: "hidden",
      }}
    >
      {/* Dashboard top bar */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Today</span>
          <span style={{ fontSize: 13, color: T.dim }}>Grades</span>
          <span style={{ fontSize: 13, color: T.dim }}>Study</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: T.green,
            }}
          />
          <span style={{ fontSize: 11, color: T.muted }}>Synced 2 min ago</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Streak + overview row */}
        <div
          style={{
            padding: "20px 20px 16px",
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            opacity: revealStep >= 1 ? 1 : 0,
            transform: revealStep >= 1 ? "translateY(0)" : "translateY(12px)",
            transition: "all 0.5s ease",
          }}
        >
          {[
            { label: "GPA", value: "3.72", sub: "Weighted" },
            { label: "Streak", value: "12 days", sub: "Personal best" },
            { label: "Due this week", value: "7", sub: "3 done" },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                flex: "1 1 120px",
                padding: "14px 16px",
                background: T.bg,
                borderRadius: 10,
                border: `1px solid ${T.border}`,
              }}
            >
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Today's plan */}
        <div
          style={{
            padding: "0 20px 16px",
            opacity: revealStep >= 2 ? 1 : 0,
            transform: revealStep >= 2 ? "translateY(0)" : "translateY(12px)",
            transition: "all 0.5s ease",
          }}
        >
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Your plan for tonight
          </div>
          {MOCK_PLAN.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: i === 0 ? `${T.accent}08` : "transparent",
                border: i === 0 ? `1px solid ${T.accent}20` : `1px solid transparent`,
                borderRadius: 8,
                marginBottom: 4,
                opacity: revealStep >= 2 + i * 0.5 ? 1 : 0,
                transform: revealStep >= 2 + i * 0.5 ? "translateX(0)" : "translateX(-10px)",
                transition: `all 0.4s ease ${i * 0.15}s`,
              }}
            >
              <span style={{ fontSize: 12, color: T.dim, fontFamily: "monospace", minWidth: 56 }}>{item.time}</span>
              <span style={{ fontSize: 13, color: T.text, flex: 1 }}>{item.task}</span>
              <Badge color={item.priority === "high" ? T.accent : T.muted}>{item.tag}</Badge>
            </div>
          ))}
        </div>

        {/* Grade cards */}
        <div style={{ padding: "0 20px 20px" }}>
          <div
            style={{
              fontSize: 12,
              color: T.muted,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
              opacity: revealStep >= 3 ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            Grade snapshot
          </div>
          {MOCK_CLASSES.map((cls, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                borderRadius: 8,
                marginBottom: 2,
                opacity: revealStep >= 4 ? 1 : 0,
                transform: revealStep >= 4 ? "translateY(0)" : "translateY(8px)",
                transition: `all 0.4s ease ${i * 0.1}s`,
              }}
            >
              <span style={{ fontSize: 13, color: T.text, flex: 1 }}>{cls.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {cls.trend === "down" && cls.grade < 90 && <Badge color={T.amber}>At risk</Badge>}
                {trendIcon(cls.trend)}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: cls.grade >= 90 ? T.green : cls.grade >= 80 ? T.text : T.amber,
                    fontFamily: "monospace",
                    minWidth: 48,
                    textAlign: "right",
                  }}
                >
                  {cls.grade}%
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: T.dim,
                    fontWeight: 500,
                    minWidth: 24,
                    textAlign: "right",
                  }}
                >
                  {cls.letter}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FEATURE SECTION ────────────────────────────────────────────

function FeatureBlock({ number, title, desc, delay }) {
  const [ref, visible] = useInView(0.2);
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        gap: 20,
        padding: "28px 0",
        borderBottom: `1px solid ${T.border}`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `all 0.5s ease ${delay}s`,
      }}
    >
      <span
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: `${T.accent}15`,
          lineHeight: 1,
          minWidth: 50,
          fontFamily: "monospace",
        }}
      >
        {number}
      </span>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

// ─── SOCIAL PROOF ───────────────────────────────────────────────

function SocialProof() {
  const [ref, visible] = useInView(0.3);
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 48,
        flexWrap: "wrap",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "all 0.6s ease",
      }}
    >
      {[
        { value: "5", label: "Students in beta" },
        { value: "127", label: "Assignments tracked" },
        { value: "12", label: "Day longest streak" },
      ].map((s, i) => (
        <div key={i} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: T.text, letterSpacing: "-0.03em" }}>{s.value}</div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────────

export default function SchoolPilotLanding() {
  const scrollY = useScrollY();
  const [heroRef, heroVisible] = useInView(0.1);

  return (
    <div
      style={{
        background: T.bg,
        color: T.text,
        fontFamily: T.font,
        minHeight: "100vh",
        overflowX: "hidden",
      }}
    >
      <style>{GLOBAL_CSS}</style>

      {/* ─── NAV ─── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: scrollY > 30 ? `${T.bg}ee` : "transparent",
          backdropFilter: scrollY > 30 ? "blur(16px) saturate(1.2)" : "none",
          borderBottom: scrollY > 30 ? `1px solid ${T.border}` : "1px solid transparent",
          transition: "all 0.3s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em" }}>SchoolPilot</span>
        </div>
        <button
          style={{
            background: T.text,
            color: T.bg,
            border: "none",
            padding: "8px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.target.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.target.style.opacity = "1")}
        >
          Get started
        </button>
      </nav>

      {/* ─── HERO ─── */}
      <section
        ref={heroRef}
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: "25%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 700,
            height: 500,
            background: `radial-gradient(ellipse, ${T.accentGlow}, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        {/* Beta pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 14px",
            borderRadius: 20,
            border: `1px solid ${T.border}`,
            fontSize: 12,
            color: T.muted,
            marginBottom: 36,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green }} />
          Now in beta — free for all students
        </div>

        <h1
          style={{
            fontSize: "clamp(34px, 6vw, 60px)",
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: "-0.04em",
            margin: "0 0 24px",
            maxWidth: 640,
          }}
        >
          Stop studying the wrong thing.
        </h1>
        <p
          style={{
            color: T.textSecondary,
            fontSize: "clamp(15px, 2vw, 17px)",
            lineHeight: 1.65,
            maxWidth: 460,
            margin: "0 0 40px",
          }}
        >
          SchoolPilot syncs with your LMS, knows every assignment and grade,
          and tells you exactly what to work on — so nothing falls through the cracks.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            style={{
              background: T.text,
              color: T.bg,
              border: "none",
              padding: "13px 32px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.target.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.target.style.opacity = "1")}
          >
            Get started free
          </button>
          <button
            style={{
              background: "transparent",
              color: T.textSecondary,
              border: `1px solid ${T.border}`,
              padding: "13px 32px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = T.borderLight;
              e.target.style.color = T.text;
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = T.border;
              e.target.style.color = T.textSecondary;
            }}
          >
            See how it works
          </button>
        </div>

        {/* Scroll indicator */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            opacity: scrollY > 50 ? 0 : 0.4,
            transition: "opacity 0.3s",
          }}
        >
          <div style={{ fontSize: 11, color: T.dim, letterSpacing: "0.05em" }}>Scroll</div>
          <div
            style={{
              width: 1,
              height: 24,
              background: `linear-gradient(to bottom, ${T.dim}, transparent)`,
            }}
          />
        </div>
      </section>

      <GlowDivider />

      {/* ─── CHAT DEMO SECTION ─── */}
      <section
        style={{
          padding: "100px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <p
            style={{
              color: T.accent,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            AI that knows your classes
          </p>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 8px" }}>
            Ask anything about your grades
          </h2>
          <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.6 }}>
            It has context on every assignment, every grade, every deadline. Not a generic chatbot.
          </p>
        </div>
        <LiveChatDemo />
      </section>

      <GlowDivider />

      {/* ─── DASHBOARD DEMO SECTION ─── */}
      <section
        style={{
          padding: "100px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <p
            style={{
              color: T.accent,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            Everything in one place
          </p>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 700, letterSpacing: "-0.03em", margin: "0 0 8px" }}>
            Your grades, your plan, your week
          </h2>
          <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.6 }}>
            Syncs with Teamie automatically. No manual entry. Always up to date.
          </p>
        </div>
        <AnimatedDashboard />
      </section>

      <GlowDivider />

      {/* ─── HOW IT WORKS ─── */}
      <section style={{ padding: "80px 24px", maxWidth: 540, margin: "0 auto" }}>
        <p
          style={{
            color: T.accent,
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 40,
          }}
        >
          How it works
        </p>
        <FeatureBlock
          number="01"
          title="Connect your LMS"
          desc="Sign in with your Teamie credentials. SchoolPilot securely syncs your courses, assignments, and grades."
          delay={0}
        />
        <FeatureBlock
          number="02"
          title="Get your daily plan"
          desc="Every morning, an AI-generated plan tells you what to work on — prioritized by deadlines and grade impact."
          delay={0.1}
        />
        <FeatureBlock
          number="03"
          title="Track your grades live"
          desc="See exactly where you stand in every class. Know what you need on the next test before you walk in."
          delay={0.2}
        />
        <FeatureBlock
          number="04"
          title="Study smarter"
          desc="Generate study guides, flashcards, and practice quizzes from your actual course material. Focus on what matters."
          delay={0.3}
        />
        <FeatureBlock
          number="05"
          title="Never miss a deadline"
          desc="Daily email briefings, grade alerts, and a focus timer to keep you on track without the stress."
          delay={0.4}
        />
      </section>

      <GlowDivider />

      {/* ─── SOCIAL PROOF ─── */}
      <section style={{ padding: "80px 24px" }}>
        <SocialProof />
      </section>

      <GlowDivider />

      {/* ─── FINAL CTA ─── */}
      <section style={{ padding: "100px 24px 120px", textAlign: "center" }}>
        <h2
          style={{
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            margin: "0 0 16px",
            maxWidth: 480,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Know exactly where you stand.
        </h2>
        <p style={{ color: T.muted, fontSize: 15, margin: "0 0 36px", lineHeight: 1.6, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
          Free for all students. No credit card.
          <br />
          Takes two minutes to set up.
        </p>
        <button
          style={{
            background: T.text,
            color: T.bg,
            border: "none",
            padding: "14px 36px",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.target.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.target.style.opacity = "1")}
        >
          Get started
        </button>
      </section>

      {/* ─── FOOTER ─── */}
      <footer
        style={{
          borderTop: `1px solid ${T.border}`,
          padding: "28px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              background: `linear-gradient(135deg, ${T.accent}, ${T.accentLight})`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>SchoolPilot</span>
        </div>
        <span style={{ fontSize: 12, color: T.dim }}>Built by a student, for students.</span>
      </footer>
    </div>
  );
}

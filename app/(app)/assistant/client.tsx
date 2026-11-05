"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Callout, Panel, cn } from "@/src/components/ui";
import {
  IconArrowRight, IconCamera, IconCheck, IconClose, IconDatabase, IconHistory,
  IconInfo, IconPlus, IconShield, IconSparkle, IconTarget,
} from "@/src/components/icons";
import { toast } from "@/src/components/toaster";
import { askAssistantAction, confirmProposalAction } from "@/src/app-actions/ai";

/**
 * The conversation.
 *
 * Every tool call is shown with its arguments and its row count. The point is
 * auditability: a figure in an answer should be traceable to the query that
 * produced it, and a user who doesn't trust an answer should be able to see
 * exactly what the model was handed.
 */

interface ToolCallView {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  mutating: boolean;
  status: string;
  summary?: string;
  durationMs: number | null;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCallView[];
  pending?: boolean;
  failed?: boolean;
}

const SUGGESTIONS = [
  "How much did I spend on food last month versus my budget?",
  "What can I cut?",
  "Am I on track for my goals?",
  "Any unusual charges this week?",
  "Which subscriptions am I not using?",
];

export function Conversation({
  initialQuestion,
  conversationId,
  history,
  conversations,
  canMutate,
}: {
  initialQuestion?: string;
  conversationId: string | null;
  history: Array<{
    id: string;
    role: string;
    content: unknown;
    toolCalls: ToolCallView[];
  }>;
  conversations: Array<{ id: string; title: string; messageCount: number; updatedAt: string }>;
  canMutate: boolean;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(() => history.map(hydrate).filter((t) => t.text || t.toolCalls.length));
  const [conversation, setConversation] = useState(conversationId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  // Scroll the newest turn into view, but not on first paint of a long history.
  useEffect(() => {
    if (turns.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  // A question arriving from the command palette asks itself once.
  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      void send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;

    setInput("");
    setBusy(true);
    setTurns((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: trimmed, toolCalls: [] },
      { id: `a-${Date.now()}`, role: "assistant", text: "", toolCalls: [], pending: true },
    ]);

    const result = await askAssistantAction({ conversationId: conversation ?? undefined, message: trimmed });

    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!result.ok || !result.data) {
        next[next.length - 1] = {
          ...last,
          pending: false,
          failed: true,
          text: result.error?.message ?? "The assistant didn't respond.",
        };
        return next;
      }
      next[next.length - 1] = {
        ...last,
        pending: false,
        text: result.data.text,
        toolCalls: result.data.toolCalls,
      };
      return next;
    });

    if (result.ok && result.data) {
      setConversation(result.data.conversationId);
    }
    setBusy(false);
  }

  async function decide(toolCallId: string, decision: "CONFIRM" | "CANCEL") {
    const result = await confirmProposalAction(toolCallId, decision);
    if (!result.ok) {
      toast.error(result.error?.message ?? "Couldn't apply that.");
      return;
    }

    setTurns((prev) =>
      prev.map((turn) => ({
        ...turn,
        toolCalls: turn.toolCalls.map((call) =>
          call.id === toolCallId
            ? { ...call, status: result.data?.status ?? "CONFIRMED", output: result.data?.output }
            : call,
        ),
      })),
    );

    if (decision === "CONFIRM") {
      toast.success("Change applied", { description: "Recorded in your activity log." });
      router.refresh();
    } else {
      toast("Left as it was");
    }
  }

  return (
    <>
      <main className="flex-1 pb-[190px]">
        <div className="mx-auto w-full max-w-[760px] px-4 lg:px-8">
          {conversations.length > 0 ? (
            <div className="flex items-center gap-2 pt-3">
              <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
                <IconHistory size={15} />
                History
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTurns([]);
                  setConversation(null);
                  router.replace("/assistant");
                }}
              >
                <IconPlus size={15} />
                New
              </Button>
            </div>
          ) : null}

          {showHistory ? (
            <Panel className="mt-2">
              {conversations.map((c) => (
                <Link
                  key={c.id}
                  href={`/assistant?c=${c.id}`}
                  className="flex items-center gap-3 border-b border-rule-faint px-4 py-2.5 text-sm last:border-0 hover:bg-rule-faint"
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-xs text-ink-tertiary">
                    {c.messageCount} messages · {formatDate(c.updatedAt)}
                  </span>
                </Link>
              ))}
            </Panel>
          ) : null}

          {turns.length === 0 ? (
            <div className="pt-10 pb-6">
              <span className="grid size-11 place-items-center rounded-lg bg-ink text-brass-bright">
                <IconSparkle size={20} />
              </span>
              <h2 className="mt-4 font-serif text-[1.9rem] leading-tight font-normal tracking-[-0.03em]">
                Ask about your money.
              </h2>
              <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-ink-secondary">
                Every figure comes from a query against your own ledger, computed by the database.
                Read-only answers run immediately. Anything that would change your data stops and
                asks you first.
              </p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="inline-flex h-8 items-center rounded-full border border-rule bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-rule-strong hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn) => (
            <div key={turn.id} className="flex gap-2.5 py-3">
              <span
                className={cn(
                  "grid size-[26px] shrink-0 place-items-center rounded-sm font-mono text-[11px] font-semibold",
                  turn.role === "user" ? "bg-sunken text-ink-secondary" : "bg-ink text-brass-bright",
                )}
                aria-hidden
              >
                {turn.role === "user" ? "You" : "C"}
              </span>

              <div className="min-w-0 flex-1">
                {turn.role === "assistant" && turn.toolCalls.length > 0 ? (
                  <div className="mb-3 flex flex-col gap-2">
                    {turn.toolCalls.map((call) => (
                      <ToolCall key={call.id} call={call} onDecide={decide} canMutate={canMutate} />
                    ))}
                  </div>
                ) : null}

                {turn.pending ? (
                  <span className="inline-flex h-5 items-center gap-1" aria-label="Thinking">
                    {[0, 1, 2].map((i) => (
                      <i
                        key={i}
                        className="size-1 rounded-full bg-ink-tertiary"
                        style={{
                          animation: `st-fade 1.1s ease-in-out ${i * 0.15}s infinite alternate`,
                        }}
                      />
                    ))}
                  </span>
                ) : turn.failed ? (
                  <Callout tone="danger" icon={<IconInfo />}>
                    {turn.text}
                  </Callout>
                ) : (
                  <div className="text-base leading-relaxed whitespace-pre-wrap">{turn.text}</div>
                )}
              </div>
            </div>
          ))}

          <div ref={endRef} />
        </div>
      </main>

      {/* Composer. Fixed above the tab bar on mobile. */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] z-30 bg-gradient-to-t from-paper from-60% to-transparent p-4 lg:bottom-0">
        <div className="mx-auto w-full max-w-[760px] lg:px-4">
          {turns.length > 0 ? (
            <div className="scrollbar-none mb-2 flex gap-1.5 overflow-x-auto">
              {["Show me those transactions", "Compare to last 6 months", "What should I cut?"].map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(s)}
                  className="inline-flex h-7 shrink-0 items-center rounded-full border border-rule bg-surface px-2.5 text-xs font-medium text-ink-secondary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 rounded-lg border border-rule-strong bg-surface p-1.5 pl-3.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="Ask about your money…"
              className="h-9 flex-1 bg-transparent text-base outline-none placeholder:text-ink-disabled"
              aria-label="Ask the assistant"
            />
            <Link
              href="/receipts"
              className="grid size-9 place-items-center rounded-md text-ink-secondary hover:bg-rule-faint"
              aria-label="Attach a receipt"
            >
              <IconCamera size={18} />
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="icon"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <IconArrowRight size={18} />
            </Button>
          </form>

          <p className="mt-2 text-center text-xs text-ink-tertiary">
            Read-only answers run immediately. Anything that changes your data asks first.
          </p>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- tool call */

function ToolCall({
  call,
  onDecide,
  canMutate,
}: {
  call: ToolCallView;
  onDecide: (id: string, decision: "CONFIRM" | "CANCEL") => void;
  canMutate: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const output = call.output as Record<string, unknown> | null;

  // A proposal is the one tool state that gets a card rather than a row: it is
  // a decision the person has to make, not a step they can skim.
  if (call.status === "PROPOSED") {
    return (
      <div className="rounded-md border border-brass/35 bg-brass-wash p-3">
        <div className="eyebrow mb-2 flex items-center gap-1.5 text-brass-deep">
          <IconShield size={12} />
          Confirm this change
        </div>
        <p className="text-sm font-medium">{call.summary ?? describeTool(call.toolName)}</p>
        <dl className="mt-2 flex flex-col gap-1 text-xs">
          {Object.entries(call.input).map(([key, value]) => (
            <div key={key} className="flex gap-3">
              <dt className="w-24 shrink-0 text-ink-secondary">{humanise(key)}</dt>
              <dd className="num m-0 min-w-0 font-medium">{String(value)}</dd>
            </div>
          ))}
        </dl>
        {canMutate ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => onDecide(call.id, "CONFIRM")}>
              <IconCheck size={14} />
              Apply this change
            </Button>
            <Button size="sm" onClick={() => onDecide(call.id, "CANCEL")}>
              Cancel
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-brass-deep">
            Your household role is read-only, so this can&rsquo;t be applied.
          </p>
        )}
        <p className="mt-2 text-xs text-brass-deep/80">
          Applied through the normal service with your permissions — the model never writes to the
          database itself.
        </p>
      </div>
    );
  }

  const rows = typeof output?.count === "number" ? output.count : Array.isArray(output) ? output.length : null;
  const failed = call.status === "FAILED" || call.status === "BLOCKED";

  return (
    <div className="overflow-clip rounded-md border border-rule bg-surface text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-rule-faint bg-sunken px-3 py-1.5 text-left"
      >
        {call.toolName.startsWith("search") || call.toolName.startsWith("analyze") ? (
          <IconDatabase size={13} className="text-ink-tertiary" />
        ) : (
          <IconTarget size={13} className="text-ink-tertiary" />
        )}
        <span className="num font-medium">{call.toolName}</span>
        <span className="ml-auto">
          {failed ? (
            <Badge tone="danger">
              <IconClose size={10} /> {call.status.toLowerCase()}
            </Badge>
          ) : (
            <Badge tone={call.status === "CONFIRMED" ? "brass" : "inflow"}>
              <IconCheck size={10} />
              {rows !== null ? `${rows} rows` : call.status === "CONFIRMED" ? "applied" : "ok"}
              {call.durationMs ? ` · ${call.durationMs} ms` : ""}
            </Badge>
          )}
        </span>
      </button>
      <div className="num px-3 py-2 text-[11px] break-words text-ink-tertiary">
        {JSON.stringify(call.input)}
      </div>
      {expanded ? (
        <pre className="num max-h-56 overflow-auto border-t border-rule-faint bg-sunken px-3 py-2 text-[11px] whitespace-pre-wrap text-ink-secondary">
          {JSON.stringify(call.output, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

/** Pull the display text out of stored Anthropic content blocks. */
function hydrate(message: { id: string; role: string; content: unknown; toolCalls: ToolCallView[] }): Turn {
  const blocks = Array.isArray(message.content) ? message.content : [];
  const text = blocks
    .filter((b): b is { type: "text"; text: string } =>
      Boolean(b && typeof b === "object" && (b as { type?: string }).type === "text"),
    )
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    text,
    toolCalls: message.toolCalls,
  };
}

const TOOL_LABELS: Record<string, string> = {
  create_transaction: "Record a transaction",
  update_transaction: "Change a transaction",
  create_transfer: "Move money between accounts",
  create_budget: "Create a budget",
  update_budget: "Change a budget",
  create_goal: "Create a goal",
};

const describeTool = (name: string): string => TOOL_LABELS[name] ?? name.replace(/_/g, " ");

const humanise = (key: string): string =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

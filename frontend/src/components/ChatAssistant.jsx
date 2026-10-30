import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  ArrowUpRight,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

// Markdown rendering is only needed once a reply arrives, so keep its parser
// out of the initial bundle.
const Streamdown = lazy(() =>
  import("streamdown").then((module) => ({ default: module.Streamdown }))
);

const CHAT_ENDPOINT = "/api/ai/chat";
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CHARS = 12_000;

const SUGGESTIONS = [
  "Beach stays under ₹5,000",
  "Quiet mountain escapes",
  "Show me heritage homestays",
  "What kinds of stays are there?",
];

const LINK_CLASS =
  "font-medium text-earth underline decoration-sand/70 underline-offset-2 transition hover:text-ink hover:decoration-earth";

/**
 * Only allow in-app paths and ordinary web links. Markdown could otherwise
 * produce a javascript: or data: URL.
 */
function safeHref(href) {
  if (typeof href !== "string") {
    return null;
  }

  const value = href.trim();
  if (!value) {
    return null;
  }
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function textOf(message) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function hasToolPart(message) {
  return message.parts.some(
    (part) => part.type === "dynamic-tool" || part.type.startsWith("tool-")
  );
}

/**
 * Send only plain text from the recent conversation. Tool calls and results are
 * server-owned: replaying them from the browser would let a client forge facts,
 * and the server re-queries the database on every turn anyway.
 */
function recentHistory(messages) {
  const textMessages = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const text = textOf(message);
      return {
        id: message.id,
        role: message.role,
        parts: text ? [{ type: "text", text }] : [],
      };
    })
    .filter((message) => message.parts.length > 0);

  const selected = [];
  let characters = 0;

  for (let index = textMessages.length - 1; index >= 0; index -= 1) {
    const message = textMessages[index];
    const size = message.parts[0].text.length;

    if (selected.length >= MAX_HISTORY_MESSAGES) {
      break;
    }
    // Always keep the newest message, even if it is at the size limit.
    if (selected.length > 0 && characters + size > MAX_HISTORY_CHARS) {
      break;
    }

    selected.unshift(message);
    characters += size;
  }

  while (selected.length > 1 && selected[0].role !== "user") {
    selected.shift();
  }

  return selected;
}

function errorMessage(error) {
  if (!error) {
    return "";
  }

  const body = error.responseBody;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.detail === "string") {
        return parsed.detail;
      }
    } catch {
      // Not JSON; fall through to the status-based message.
    }
  }

  if (error.statusCode === 413) {
    return "That conversation is too large. Start a new conversation.";
  }
  if (error.statusCode === 422) {
    return "That message could not be sent. Check it and try again.";
  }
  if (error.statusCode === 429) {
    return "You're sending messages too quickly. Please wait a moment and try again.";
  }
  if (error.statusCode === 503) {
    return "Mira is not available right now. Please try again later.";
  }

  const message = typeof error.message === "string" ? error.message.trim() : "";
  if (message && !message.startsWith("{")) {
    return message;
  }

  return "Mira is unavailable right now. Please try again.";
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-earth/50"
          style={{ animationDelay: `${delay}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

function AssistantAvatar({ className = "size-8 rounded-full" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-linear-to-br from-earth to-ink text-linen shadow-sm shadow-earth/25 ${className}`}
    >
      <Sparkles className="size-4" />
    </span>
  );
}

function EmptyState({ onPick, disabled }) {
  return (
    <div className="chat-message flex flex-col items-center px-1 py-8 text-center">
      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-earth via-earth to-ink text-linen shadow-lg shadow-earth/25">
        <Sparkles className="size-6" />
        <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-linen bg-sand" />
      </span>
      <h3 className="mt-5 font-display text-xl font-bold tracking-tight text-ink">
        Find your next{" "}
        <em className="font-serif text-[1.15em] font-semibold italic text-earth">
          stay.
        </em>
      </h3>
      <p className="mt-2 max-w-[19rem] text-sm leading-relaxed text-earth/90">
        I&apos;m Mira, your stay concierge. I can search current EazyInvites
        listings, compare nightly prices, and share public details. I
        can&apos;t make bookings or payments.
      </p>
      <div className="mt-7 w-full rounded-2xl border border-clay/80 bg-white/60 p-3 text-left shadow-[0_1px_2px_rgba(58,47,40,0.04)] backdrop-blur">
        <p className="px-1 pb-2 text-[10px] font-bold tracking-[0.18em] text-sand uppercase">
          Try asking
        </p>
        <div className="flex flex-col gap-1">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              disabled={disabled}
              className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-clay/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{suggestion}</span>
              <ArrowUpRight className="size-4 shrink-0 text-sand transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-earth" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatAssistant({ open, onOpenChange }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const transport = useRef(
    new DefaultChatTransport({
      api: CHAT_ENDPOINT,
      credentials: "same-origin",
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
        body: {
          id,
          messages: recentHistory(messages),
          trigger,
          ...(messageId ? { messageId } : {}),
        },
      }),
    })
  ).current;

  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status,
    error,
    clearError,
    setMessages,
  } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";
  const canSend = !busy && input.trim().length > 0;
  const lastIndex = messages.length - 1;

  // Assistant replies link to listing pages. Use React Router for in-app paths
  // so navigation stays client-side, and close the panel first.
  const markdownComponents = useMemo(
    () => ({
      a({ href, children }) {
        const safe = safeHref(href);
        if (!safe) {
          return <span>{children}</span>;
        }

        if (safe.startsWith("/")) {
          return (
            <Link
              to={safe}
              onClick={() => onOpenChange?.(false)}
              className={LINK_CLASS}
            >
              {children}
            </Link>
          );
        }

        return (
          <a
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {children}
          </a>
        );
      },
    }),
    [onOpenChange]
  );

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, status, open]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  async function handleSend(text) {
    const value = (text ?? input).trim();
    if (!value || busy) {
      return;
    }
    if (value.length > MAX_MESSAGE_CHARS) {
      return;
    }

    clearError();
    setInput("");
    try {
      await sendMessage({ text: value });
    } catch {
      // useChat surfaces transport failures through its `error` state.
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    handleSend();
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  async function handleStop() {
    try {
      await stop();
    } catch {
      // Stopping is best effort; the UI returns to ready on its own.
    }
  }

  async function handleRetry() {
    clearError();
    try {
      await regenerate();
    } catch {
      // The error state is rendered from useChat.
    }
  }

  async function handleClear() {
    if (busy) {
      await handleStop();
    }
    setMessages([]);
    clearError();
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-clay/70 p-0 sm:max-w-[30rem]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <SheetHeader className="relative flex-row items-start justify-between gap-3 overflow-hidden border-b border-clay/70 bg-linear-to-br from-[#f7f2ea] via-linen to-[#f1e9dc] px-5 py-4 pr-14">
          <div className="min-w-0">
            <SheetTitle className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink">
              <AssistantAvatar className="size-9 rounded-xl" />
              <span className="truncate">
                Mira{" "}
                <em className="font-serif text-[1.2em] font-semibold italic text-earth">
                  concierge
                </em>
              </span>
            </SheetTitle>
            <SheetDescription className="mt-1.5 text-xs text-earth/80">
              Your EazyInvites stay concierge. Ask about stays, prices, and
              places.
            </SheetDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={messages.length === 0 && !error}
            className="mt-0.5 shrink-0 rounded-full border border-clay/70 bg-white/60 px-2.5 text-[10px] font-bold tracking-[0.12em] text-earth uppercase hover:border-sand hover:bg-white"
          >
            <Trash2 />
            Clear
          </Button>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="chat-canvas min-h-0 flex-1 overflow-hidden"
        >
          <ScrollArea className="h-full">
            <div
              className={`flex flex-col gap-4 px-4 py-6 ${
                messages.length === 0 ? "min-h-full justify-center" : ""
              }`}
            >
              {messages.length === 0 && (
                <EmptyState onPick={handleSend} disabled={busy} />
              )}

              {messages.map((message, index) => {
                const text = textOf(message);
                const isUser = message.role === "user";
                const streaming = busy && index === lastIndex;

                if (isUser) {
                  if (!text) {
                    return null;
                  }
                  return (
                    <div key={message.id} className="chat-message flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-linear-to-br from-earth to-[#6f5a42] px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-linen shadow-sm shadow-earth/20">
                        {text}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={message.id} className="chat-message flex gap-2.5">
                    <AssistantAvatar />
                    <div className="min-w-0 flex-1">
                      {text ? (
                        <div className="rounded-2xl rounded-tl-md border border-clay/70 bg-white/85 px-4 py-3 text-sm leading-relaxed text-ink shadow-[0_1px_2px_rgba(58,47,40,0.04)]">
                          <Suspense
                            fallback={
                              <p className="break-words whitespace-pre-wrap">
                                {text}
                              </p>
                            }
                          >
                            <Streamdown
                              mode={streaming ? "streaming" : "static"}
                              parseIncompleteMarkdown
                              skipHtml
                              components={markdownComponents}
                              disallowedElements={[
                                "img",
                                "script",
                                "iframe",
                                "object",
                                "embed",
                                "form",
                                "input",
                                "video",
                                "audio",
                                "source",
                              ]}
                              className="[&_a]:text-earth [&_a]:underline [&_blockquote]:border-earth/30 [&_code]:bg-clay/70 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_hr]:border-clay [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_table]:text-xs [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                            >
                              {text}
                            </Streamdown>
                          </Suspense>
                        </div>
                      ) : streaming ? (
                        <span className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-clay/70 bg-white/85 px-4 py-3 text-xs font-medium text-earth shadow-sm">
                          <TypingDots />
                          {hasToolPart(message)
                            ? "Searching current stays"
                            : "Mira is thinking…"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {busy && messages[lastIndex]?.role === "user" && (
                <div className="chat-message flex gap-2.5">
                  <AssistantAvatar />
                  <span className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-clay/70 bg-white/85 px-4 py-3 text-xs font-medium text-earth shadow-sm">
                    <TypingDots />
                    Mira is thinking…
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="border-t border-clay/70 bg-white/60 px-4 pt-3 pb-4 backdrop-blur">
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-2xl border border-red-200/80 bg-red-50/80 px-3.5 py-3 text-xs text-red-800"
            >
              <p>{errorMessage(error)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={busy || messages.length === 0}
                className="mt-2 rounded-full border-red-200 bg-white text-red-800 hover:bg-red-50"
              >
                <RotateCcw />
                Try again
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-1.5 rounded-[1.4rem] border border-clay bg-white p-1.5 shadow-sm transition focus-within:border-sand focus-within:ring-4 focus-within:ring-sand/20">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Mira about a stay…"
                rows={1}
                maxLength={MAX_MESSAGE_CHARS}
                aria-label="Message Mira, the EazyInvites concierge"
                className="max-h-32 min-h-10 resize-none border-0 bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleStop}
                  aria-label="Stop response"
                  className="size-10 shrink-0 rounded-full border-clay bg-white text-earth hover:bg-clay/60"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!canSend}
                  aria-label="Send message"
                  className="size-10 shrink-0 rounded-full bg-earth text-linen shadow-md shadow-earth/25 transition hover:bg-ink hover:shadow-lg disabled:shadow-none"
                >
                  <Send className="size-4" />
                </Button>
              )}
            </div>
          </form>

          <div className="mt-2 flex items-start justify-between gap-3 px-1">
            <p className="text-[10px] leading-relaxed text-sand">
              Mira can make mistakes. Check listing details before you book.
            </p>
            <span className="hidden shrink-0 pt-px text-[10px] font-bold tracking-[0.14em] text-sand/80 uppercase sm:inline">
              Enter ↵
            </span>
          </div>
          <p className="sr-only" role="status">
            {status === "submitted" || status === "streaming"
              ? "Mira is responding."
              : status === "error"
                ? "Mira could not respond."
                : "Mira is ready."}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

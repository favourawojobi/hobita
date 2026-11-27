"use client";

import { useMemo, useRef, useState } from "react";

function humanDuration(seconds: number) {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

export function PayoutVoice({
  wallet,
  round,
  mySlot,
  memberCount,
  periodSeconds,
  deadline,
  amount,
  contribution,
}: {
  wallet: string;
  round: number;
  mySlot: number | null;
  memberCount: number;
  periodSeconds: number;
  deadline: number;
  amount: string;
  contribution: string;
}) {
  const [busy, setBusy] = useState(false);
  const [script, setScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const secondsToDeadline = deadline - Math.floor(Date.now() / 1000);

  const payoutLine = useMemo(() => {
    if (!wallet || mySlot == null) {
      return "Connect a member wallet and I will tell you exactly when your payout lands.";
    }
    const roundsAway = mySlot - round;
    if (roundsAway < 0) {
      return `You already collected your payout in round ${mySlot}. Your safety deposit comes back when the circle finishes.`;
    }
    if (roundsAway === 0) {
      return `It is your turn now. As soon as round ${round} is fully paid, the pot of ${amount} goes to you.`;
    }
    const wait = roundsAway * periodSeconds;
    return `You are member ${mySlot} of ${memberCount}. This is round ${round}. Your payout is ${roundsAway} round${roundsAway === 1 ? "" : "s"} away, in about ${humanDuration(wait)}.`;
  }, [amount, memberCount, mySlot, periodSeconds, round, wallet]);

  const dueLine = useMemo(() => {
    if (secondsToDeadline > 0) {
      return `Round ${round} is due in ${humanDuration(secondsToDeadline)}. Your contribution is ${contribution}. If you miss it, the group can cover it from your safety deposit.`;
    }
    return `Round ${round} is past its deadline. Anyone in the circle can cover a missed payment from the member's safety deposit, so the payout still goes out on time.`;
  }, [contribution, round, secondsToDeadline]);

  async function speak(text: string) {
    setBusy(true);
    setError(null);
    setScript(text);
    try {
      audioRef.current?.pause();
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (data.error === "voice_not_configured") {
          fallback(text);
          return;
        }
        throw new Error("voice request failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      fallback(text);
    } finally {
      setBusy(false);
    }
  }

  function fallback(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setError("Voice is unavailable in this browser.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="card mt-2 border-forest/10 bg-white/60">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold">Ask Hobita</p>
          <p className="mt-0.5 text-[10px] text-ink/40">
            ElevenLabs voice · English
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-cream">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z"
              fill="currentColor"
            />
            <path
              d="M6 11a6 6 0 0 0 12 0M12 17v3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn-ghost !min-h-[42px] !px-3 !text-[11px]"
          disabled={busy}
          onClick={() => speak(payoutLine)}
        >
          {busy ? "Speaking…" : "When is my payout?"}
        </button>
        <button
          type="button"
          className="btn-ghost !min-h-[42px] !px-3 !text-[11px]"
          disabled={busy}
          onClick={() => speak(dueLine)}
        >
          When is it due?
        </button>
      </div>

      {script && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink/50">
          &ldquo;{script}&rdquo;
        </p>
      )}
      {error && (
        <p className="mt-2 text-[11px] font-medium text-coral">{error}</p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ParsedLog } from "@/lib/logParser";

function sample<T>(arr: T[], n: number) {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]!);
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");

export function AiInsights({ log, stats }: { log: ParsedLog; stats: { dist: number; start: number; end: number; maxSpeed: number; maxSteer: number } }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    ctrl.current?.abort();
    setText("");
    setError("");
  }, [log]);

  const run = async () => {
    setBusy(true);
    setText("");
    setError("");
    ctrl.current = new AbortController();
    const summary = {
      file: log.fileName,
      start: iso(stats.start),
      end: iso(stats.end),
      durationMin: Math.round((stats.end - stats.start) / 60000),
      distanceMeters: Math.round(stats.dist * 1000),
      maxSpeedKmh: +stats.maxSpeed.toFixed(1),
      maxSteeringDeg: stats.maxSteer,
      gps: sample(log.fixes, 80).map((f) => [iso(f.t).slice(11), +f.lat.toFixed(5), +f.lon.toFixed(5), +f.speedKmh.toFixed(1)]),
      speed: sample(log.speeds, 80).map((s) => [iso(s.t).slice(11), s.kmh]),
      steering: sample(log.steering.filter((s) => s.angle !== 0), 80).map((s) => [iso(s.t).slice(11), s.angle, s.direction ? "right" : "left"]),
      steeringReadingsTotal: log.steering.length,
      events: sample(log.events, 40).map((e) => [iso(e.t).slice(11), e.kind, e.label.slice(0, 80)]),
    };
    try {
      const res = await fetch("/api/analyze-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
        signal: ctrl.current.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setText(acc);
      }
      if (!acc.trim()) setError("The AI didn't return an explanation. Please try again later.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI driving insights</h3>
        {busy ? (
          <Button size="sm" variant="secondary" onClick={() => ctrl.current?.abort()}><Square className="h-4 w-4" /> Stop</Button>
        ) : (
          <Button size="sm" onClick={run}><Sparkles className="h-4 w-4" /> Explain this trip</Button>
        )}
      </div>
      {!text && !busy && !error && <p className="text-sm text-muted-foreground">Sends this trip's GPS, speed and steering data to Lovable AI for a plain-language explanation of your driving patterns and notable events.</p>}
      {busy && !text && <p className="text-sm text-muted-foreground">Analysing trip…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {text && <div className="text-sm whitespace-pre-wrap leading-relaxed">{text.replace(/\*\*/g, "")}</div>}
    </div>
  );
}

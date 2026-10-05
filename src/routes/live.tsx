import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";
import { Radio, Play, Square, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseLog, type GpsFix, type SpeedSample, type SteerSample, type LogEvent } from "@/lib/logParser";

const TripMap = lazy(() => import("@/components/TripMap"));

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Head Unit Data — Drive Log" },
      { name: "description", content: "Watch GPS, speed and steering from your Hycan or GAC head unit in real time." },
      { property: "og:title", content: "Live Head Unit Data — Drive Log" },
      { property: "og:description", content: "Real-time GPS, speed and steering from your car head unit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Live,
});

const MAX = 600;
const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Live() {
  const [url, setUrl] = useState("http://localhost:8765/stream");
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [fixes, setFixes] = useState<GpsFix[]>([]);
  const [speeds, setSpeeds] = useState<SpeedSample[]>([]);
  const [steer, setSteer] = useState<SteerSample[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [lines, setLines] = useState(0);
  const stop = useRef<() => void>(() => {});
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ingest = (batch: string[]) => {
    const name = `live.${new Date().getFullYear()}0101.txt`;
    const p = parseLog(batch.join("\n"), name);
    setLines((n) => n + batch.length);
    if (p.fixes.length) setFixes((a) => [...a, ...p.fixes].slice(-MAX));
    if (p.speeds.length) setSpeeds((a) => [...a, ...p.speeds].slice(-MAX));
    if (p.steering.length) setSteer((a) => [...a, ...p.steering].slice(-MAX));
    if (p.events.length) setEvents((a) => [...p.events.reverse(), ...a].slice(0, 100));
  };

  const reset = () => { setFixes([]); setSpeeds([]); setSteer([]); setEvents([]); setLines(0); };

  const connect = () => {
    stop.current();
    reset();
    setStatus("connecting");
    const es = new EventSource(url);
    es.onopen = () => setStatus("live");
    es.onmessage = (e) => { try { ingest(JSON.parse(e.data)); } catch { /* ignore */ } };
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "error" : "connecting");
    stop.current = () => { es.close(); setStatus("idle"); };
  };

  useEffect(() => () => stop.current(), []);

  const last = fixes[fixes.length - 1] ?? null;
  const speedNow = speeds[speeds.length - 1]?.kmh ?? last?.speedKmh ?? 0;
  const steerNow = steer[steer.length - 1];
  const steerDeg = steerNow ? (steerNow.direction ? steerNow.angle : -steerNow.angle) : 0;
  const steerData = useMemo(() => steer.map((s) => ({ t: s.t, a: s.direction ? s.angle : -s.angle })), [steer]);
  const speedData = useMemo(() => (speeds.length ? speeds : fixes.map((f) => ({ t: f.t, kmh: f.speedKmh }))), [speeds, fixes]);
  const running = status !== "idle" && status !== "error";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2"><Radio className="h-5 w-5 text-primary" /> Live head unit</h1>
            <p className="text-sm text-muted-foreground">Real-time data from your Hycan / GAC head unit</p>
          </div>
        </div>
        <StatusPill status={status} lines={lines} />
      </header>

      <main className="p-4 md:p-6 space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap gap-2 items-center">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="max-w-sm" aria-label="Bridge address" />
          {running ? (
            <Button variant="secondary" onClick={() => stop.current()}><Square className="h-4 w-4" /> Stop</Button>
          ) : (
            <Button onClick={connect}><Play className="h-4 w-4" /> Connect</Button>
          )}
          <a href="/bridge/headunit-bridge.mjs" download className="ml-auto text-sm text-primary inline-flex items-center gap-1"><Download className="h-4 w-4" /> Bridge script</a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Big label="Speed" value={speedNow.toFixed(1)} unit="km/h" />
          <Big label="Steering" value={`${steerDeg}`} unit="°" />
          <Big label="Position" value={last ? `${last.lat.toFixed(4)}, ${last.lon.toFixed(4)}` : "—"} unit="" small />
          <Big label="Last update" value={last || steerNow ? fmt(Math.max(last?.t ?? 0, steerNow?.t ?? 0)) : "—"} unit="" small />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-[380px] rounded-lg border border-border bg-card overflow-hidden">
            <Suspense fallback={<div className="p-6 text-muted-foreground">Loading map…</div>}>
              {mounted && <TripMap fixes={fixes} cursor={last} />}
            </Suspense>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 h-[380px] flex flex-col items-center justify-center gap-4">
            <h3 className="font-semibold self-start">Steering wheel</h3>
            <div className="h-40 w-40 rounded-full border-8 border-muted relative transition-transform duration-300" style={{ transform: `rotate(${steerDeg}deg)` }}>
              <div className="absolute left-1/2 top-0 h-1/2 w-2 -translate-x-1/2 bg-primary rounded" />
              <div className="absolute left-0 top-1/2 h-2 w-full -translate-y-1/2 bg-muted" />
            </div>
            <p className="text-sm text-muted-foreground">{steer.length} readings</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Chart title="Speed (km/h)" data={speedData} k="kmh" color="var(--chart-1)" />
          <Chart title="Steering angle (°)" data={steerData} k="a" color="var(--chart-2)" />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold mb-3">How to connect your car</h3>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
            <li>On the head unit, turn on developer options and USB / wireless debugging.</li>
            <li>On a laptop, install Android platform-tools (adb) and Node.js, then run <code className="text-foreground">adb connect &lt;head-unit-ip&gt;:5555</code> or plug in USB.</li>
            <li>Download the bridge script above and run <code className="text-foreground">node headunit-bridge.mjs</code>.</li>
            <li>Open this page on the same laptop and press Connect. Data appears as you drive.</li>
          </ol>
        </div>
      </main>
    </div>
  );
}

function StatusPill({ status, lines }: { status: string; lines: number }) {
  const label = { idle: "Not connected", connecting: "Connecting…", live: "Live", error: "Can't reach bridge" }[status];
  const dot = status === "live" ? "bg-primary animate-pulse" : status === "error" ? "bg-destructive" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2 text-sm rounded-full border border-border px-3 py-1">
      <span className={`h-2 w-2 rounded-full ${dot}`} /> {label} <span className="text-muted-foreground">· {lines} lines</span>
    </div>
  );
}

function Big({ label, value, unit, small }: { label: string; value: string; unit: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${small ? "text-lg" : "text-4xl"} font-semibold tabular-nums mt-1`}>{value}<span className="text-base text-muted-foreground ml-1">{unit}</span></div>
    </div>
  );
}

function Chart({ title, data, k, color }: { title: string; data: object[]; k: string; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold mb-2 text-sm">{title}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmt} stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} />
            <Line type="monotone" dataKey={k} stroke={color} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";
import { Radio, Play, Square, Download, Save, Trash2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { parseLog, type GpsFix, type SpeedSample, type SteerSample, type LogEvent } from "@/lib/logParser";
import { drivingScore } from "@/lib/drivingScore";
import { listTrips, saveTrip, deleteTrip, type SavedTrip } from "@/lib/savedTrips";
import { hasNativeLogcat, startNative } from "@/lib/nativeLogcat";

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

  const [native, setNative] = useState(false);
  useEffect(() => {
    const ok = hasNativeLogcat();
    setNative(ok);
    if (ok) void connectNative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectNative = async () => {
    stop.current();
    reset();
    setStatus("connecting");
    try {
      const h = await startNative(ingest, (m) => { toast.error(m); setStatus("error"); });
      setStatus("live");
      toast.success(h.mode === "root" ? "Reading car data (root)" : "Reading car data");
      stop.current = () => { h.stop(); setStatus("idle"); };
    } catch (e) {
      setStatus("error");
      toast.error(e instanceof Error ? e.message : "Could not read car data");
    }
  };

  useEffect(() => () => stop.current(), []);

  // Saved trips (stored on this device)
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [replaying, setReplaying] = useState<string | null>(null);
  useEffect(() => setTrips(listTrips()), []);
  const fullTrip = useRef<{ fixes: GpsFix[]; speeds: SpeedSample[]; steering: SteerSample[]; events: LogEvent[] }>({ fixes: [], speeds: [], steering: [], events: [] });
  // accumulate everything during a live session (not capped) for saving
  useEffect(() => { if (status === "live") fullTrip.current = { fixes, speeds, steering: steer, events }; }, [status, fixes, speeds, steer, events]);

  const onSave = () => {
    const d = fullTrip.current.fixes.length || fullTrip.current.speeds.length || fullTrip.current.steering.length ? fullTrip.current : { fixes, speeds, steering: steer, events };
    if (!d.fixes.length && !d.speeds.length && !d.steering.length) { toast.error("Nothing to save yet"); return; }
    saveTrip({ name: `Trip ${new Date().toLocaleString()}`, ...d });
    setTrips(listTrips());
    toast.success("Trip saved");
  };

  const replay = (trip: SavedTrip) => {
    stop.current(); reset(); setReplaying(trip.id);
    const all = [...trip.fixes, ...trip.speeds, ...trip.steering].map((x) => x.t);
    if (!all.length) return;
    const t0 = Math.min(...all), t1 = Math.max(...all);
    let clock = t0;
    const id = setInterval(() => {
      clock += 2000; // 8x speed (2s of driving every 250ms)
      setFixes(trip.fixes.filter((f) => f.t <= clock).slice(-MAX));
      setSpeeds(trip.speeds.filter((f) => f.t <= clock).slice(-MAX));
      setSteer(trip.steering.filter((f) => f.t <= clock).slice(-MAX));
      setEvents(trip.events.filter((f) => f.t <= clock).slice(0, 100));
      if (clock >= t1) { clearInterval(id); setReplaying(null); }
    }, 250);
    stop.current = () => { clearInterval(id); setReplaying(null); setStatus("idle"); };
  };

  const last = fixes[fixes.length - 1] ?? null;
  const speedNow = speeds[speeds.length - 1]?.kmh ?? last?.speedKmh ?? 0;
  const steerNow = steer[steer.length - 1];
  const steerDeg = steerNow ? (steerNow.direction ? steerNow.angle : -steerNow.angle) : 0;
  const steerData = useMemo(() => steer.map((s) => ({ t: s.t, a: s.direction ? s.angle : -s.angle })), [steer]);
  const speedData = useMemo(() => (speeds.length ? speeds : fixes.map((f) => ({ t: f.t, kmh: f.speedKmh }))), [speeds, fixes]);
  const score = useMemo(() => drivingScore(speedData as SpeedSample[], steer), [speedData, steer]);
  const running = (status !== "idle" && status !== "error") || !!replaying;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
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
          {!native && <Input value={url} onChange={(e) => setUrl(e.target.value)} className="max-w-sm" aria-label="Bridge address" />}
          {running ? (
            <Button variant="secondary" onClick={() => stop.current()}><Square className="h-4 w-4" /> Stop</Button>
          ) : native ? (
            <Button onClick={connectNative}><Play className="h-4 w-4" /> Read from car</Button>
          ) : (
            <Button onClick={connect}><Play className="h-4 w-4" /> Connect</Button>
          )}
          <Button variant="outline" onClick={onSave} disabled={!!replaying}><Save className="h-4 w-4" /> Save trip</Button>
          {replaying && <span className="text-sm text-primary">Replaying saved trip…</span>}
          <a href="/bridge/headunit-bridge.mjs" download className="ml-auto text-sm text-primary inline-flex items-center gap-1"><Download className="h-4 w-4" /> Bridge script</a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Big label="Speed" value={speedNow.toFixed(1)} unit="km/h" />
          <Big label="Steering" value={`${steerDeg}`} unit="°" />
          <Big label="Position" value={last ? `${last.lat.toFixed(4)}, ${last.lon.toFixed(4)}` : "—"} unit="" small />
          <Big label="Last update" value={last || steerNow ? fmt(Math.max(last?.t ?? 0, steerNow?.t ?? 0)) : "—"} unit="" small />
        </div>

        <div className="rounded-lg border border-border bg-card p-4 grid md:grid-cols-[auto_1fr] gap-6 items-center">
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Driving score</div>
            <div className={`text-6xl font-bold tabular-nums ${score.total >= 80 ? "text-primary" : score.total >= 60 ? "text-foreground" : "text-destructive"}`}>{score.total}</div>
            <div className="flex gap-3 text-xs text-muted-foreground mt-2">
              <span>Speed {score.speed}</span><span>Steering {score.steering}</span><span>Accel {score.accel}</span>
            </div>
          </div>
          <ul className="space-y-1 text-sm">
            {score.tips.map((t) => <li key={t} className="flex gap-2"><Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />{t}</li>)}
          </ul>
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
          <h3 className="font-semibold mb-3">Saved trips</h3>
          {trips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved trips yet. Press "Save trip" after driving.</p>
          ) : (
            <ul className="divide-y divide-border">
              {trips.map((t) => {
                const s = drivingScore(t.speeds.length ? t.speeds : t.fixes.map((f) => ({ t: f.t, kmh: f.speedKmh })), t.steering);
                return (
                  <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1">{t.name} <span className="text-muted-foreground">· score {s.total}</span></span>
                    <Button size="sm" variant="secondary" onClick={() => replay(t)}><Play className="h-4 w-4" /> Replay</Button>
                    <Button size="sm" variant="ghost" aria-label="Delete trip" onClick={() => { deleteTrip(t.id); setTrips(listTrips()); }}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                );
              })}
            </ul>
          )}
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

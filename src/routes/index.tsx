import { createFileRoute } from "@tanstack/react-router";
import { AiInsights } from "@/components/AiInsights";
import { lazy, Suspense, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Upload, MapPin, Gauge, Navigation, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { parseLog, summarize, type ParsedLog } from "@/lib/logParser";

const TripMap = lazy(() => import("@/components/TripMap"));

const SAMPLES = [
  "GAC_G6SA-r8a7796.2026050716.txt",
  "GAC_G6SA-r8a7796.2026050716_1.txt",
  "GAC_G6SA-r8a7796.2026081220.txt",
  "GAC_G6SA-r8a7796.20260812201.txt",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Drive Log — Trip Map & Timeline from Head Unit Logs" },
      { name: "description", content: "Upload your car head unit logs to see GPS trips on a map with speed and steering timelines." },
      { property: "og:title", content: "Drive Log — Trip Map & Timeline" },
      { property: "og:description", content: "See GPS trips, speed and steering events from your car head unit logs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDate = (t: number) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Index() {
  const [logs, setLogs] = useState<ParsedLog[]>([]);
  const [active, setActive] = useState(0);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const addTexts = (items: { name: string; text: string }[]) => {
    const parsed = items.map((i) => parseLog(i.text, i.name));
    setLogs((prev) => {
      const next = [...prev, ...parsed].sort((a, b) => a.fileName.localeCompare(b.fileName));
      return next;
    });
    setActive(0);
    setCursorT(null);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setLoading(true);
    addTexts(await Promise.all([...files].map(async (f) => ({ name: f.name, text: await f.text() }))));
    setLoading(false);
  };

  const loadSamples = async () => {
    setLoading(true);
    setLogs([]);
    const items = await Promise.all(SAMPLES.map(async (n) => ({ name: n, text: await (await fetch(`/samples/${n}`)).text() })));
    addTexts(items);
    setLoading(false);
  };

  const log = logs[active];
  const stats = useMemo(() => (log ? summarize(log) : null), [log]);

  const cursorFix = useMemo(() => {
    if (!log?.fixes.length || cursorT == null) return null;
    return log.fixes.reduce((best, f) => (Math.abs(f.t - cursorT) < Math.abs(best.t - cursorT) ? f : best));
  }, [log, cursorT]);

  const timeline = useMemo(() => {
    if (!log) return [];
    const items = [
      ...log.steering.filter((s) => s.angle !== 0).map((s) => ({ t: s.t, kind: "Steering", label: `Wheel ${s.angle}° ${s.direction ? "right" : "left"}` })),
      ...log.events.map((e) => ({ t: e.t, kind: e.kind, label: e.label })),
    ];
    const moves = log.fixes.filter((f, i) => i > 0 && f.speedKmh > 3 && log.fixes[i - 1]!.speedKmh <= 3);
    moves.forEach((f) => items.push({ t: f.t, kind: "Moving", label: `Started moving at ${f.speedKmh.toFixed(1)} km/h` }));
    return items.sort((a, b) => a.t - b.t).slice(0, 300);
  }, [log]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Drive Log</h1>
          <p className="text-sm text-muted-foreground">Trip map & timeline from your head unit logs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadSamples} disabled={loading}>Load my GAC logs</Button>
          <Button asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4" /> Upload logs
              <input type="file" accept=".txt,.log" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
          </Button>
        </div>
      </header>

      {!log ? (
        <div className="flex flex-col items-center justify-center py-32 text-center gap-4 px-6">
          <Navigation className="h-12 w-12 text-primary" />
          <h2 className="text-2xl font-semibold">{loading ? "Reading logs…" : "Drop in your head unit logs"}</h2>
          <p className="text-muted-foreground max-w-md">Everything is read on your device. We pull out GPS positions, speed and steering wheel angle and show them on a map and timeline.</p>
        </div>
      ) : (
        <main className="p-4 md:p-6 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {logs.map((l, i) => (
              <button key={l.fileName + i} onClick={() => { setActive(i); setCursorT(null); }}
                className={`shrink-0 rounded-md border px-3 py-2 text-left text-xs ${i === active ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                <div className="flex items-center gap-1 font-medium"><FileText className="h-3 w-3" />{l.fileName.replace("GAC_G6SA-r8a7796.", "")}</div>
                <div className="text-muted-foreground">{l.fixes.length} fixes · {l.steering.length} steer</div>
              </button>
            ))}
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={<Clock className="h-4 w-4" />} label="Recorded" value={stats.start ? fmtDate(stats.start) : "—"} sub={stats.end ? `${Math.round((stats.end - stats.start) / 60000)} min` : ""} />
              <Stat icon={<MapPin className="h-4 w-4" />} label="Distance" value={`${(stats.dist * 1000).toFixed(0)} m`} sub={`${log.fixes.length} GPS fixes`} />
              <Stat icon={<Gauge className="h-4 w-4" />} label="Top speed" value={`${stats.maxSpeed.toFixed(1)} km/h`} sub={`${log.speeds.length} speed samples`} />
              <Stat icon={<Navigation className="h-4 w-4" />} label="Max steering" value={`${stats.maxSteer}°`} sub={`${log.steering.length} readings`} />
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 h-[420px] rounded-lg border border-border bg-card overflow-hidden">
              {log.fixes.length ? (
                <Suspense fallback={<div className="p-6 text-muted-foreground">Loading map…</div>}>
                  <TripMap fixes={log.fixes} cursor={cursorFix} />
                </Suspense>
              ) : <div className="p-6 text-muted-foreground">No GPS fixes in this log.</div>}
            </div>
            <div className="rounded-lg border border-border bg-card p-4 h-[420px] flex flex-col">
              <h3 className="font-semibold mb-2">Event timeline</h3>
              <div className="overflow-y-auto flex-1 space-y-1 text-sm">
                {timeline.length === 0 && <p className="text-muted-foreground">No steering or vehicle events in this log.</p>}
                {timeline.map((e, i) => (
                  <button key={i} onClick={() => setCursorT(e.t)} className={`w-full text-left rounded px-2 py-1 hover:bg-accent ${cursorT === e.t ? "bg-accent" : ""}`}>
                    <span className="text-muted-foreground tabular-nums mr-2">{fmtTime(e.t)}</span>
                    <span className="text-primary mr-2 text-xs uppercase">{e.kind}</span>
                    <span className="break-all">{e.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {stats && stats.end > stats.start && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">Scrub through the trip</span>
                <span className="text-muted-foreground tabular-nums">
                  {cursorT ? fmtTime(cursorT) : "—"}{cursorFix ? ` · ${cursorFix.lat.toFixed(5)}, ${cursorFix.lon.toFixed(5)} · ${cursorFix.speedKmh.toFixed(1)} km/h` : ""}
                </span>
              </div>
              <Slider min={stats.start} max={stats.end} step={1000} value={[cursorT ?? stats.start]} onValueChange={(v) => setCursorT(v[0] ?? null)} />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <ChartCard title="Speed (km/h)">
              <AreaChart data={log.speeds.length ? log.speeds : log.fixes.map((f) => ({ t: f.t, kmh: f.speedKmh }))}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtTime} stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip labelFormatter={(v) => fmtTime(Number(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
                <Area type="stepAfter" dataKey="kmh" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.25} />
                {cursorT && <ReferenceLine x={cursorT} stroke="var(--foreground)" />}
              </AreaChart>
            </ChartCard>
            <ChartCard title="Steering wheel angle (°)">
              <LineChart data={log.steering.map((s) => ({ t: s.t, angle: s.direction ? s.angle : -s.angle }))}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtTime} stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip labelFormatter={(v) => fmtTime(Number(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }} />
                <Line type="monotone" dataKey="angle" stroke="var(--chart-2)" dot={false} />
                {cursorT && <ReferenceLine x={cursorT} stroke="var(--foreground)" />}
              </LineChart>
            </ChartCard>
          </div>
          {stats && <AiInsights log={log} stats={stats} />}
        </main>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">{icon}{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold mb-2 text-sm">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

export type GpsFix = { t: number; lat: number; lon: number; alt: number; speedKmh: number; bearing: number };
export type SpeedSample = { t: number; kmh: number };
export type SteerSample = { t: number; angle: number; direction: number; speed: number };
export type LogEvent = { t: number; kind: "gear" | "power" | "network" | "app" | "info"; label: string };

export type ParsedLog = {
  fileName: string;
  fixes: GpsFix[];
  speeds: SpeedSample[];
  steering: SteerSample[];
  events: LogEvent[];
};

const LINE_TS = /^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/;

function yearFromName(name: string): number {
  const m = name.match(/\.(20\d{2})\d{4}/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

export function parseLog(text: string, fileName: string): ParsedLog {
  const year = yearFromName(fileName);
  const fixes: GpsFix[] = [];
  const speeds: SpeedSample[] = [];
  const steering: SteerSample[] = [];
  const events: LogEvent[] = [];
  let lastSpeed = -1;

  for (const line of text.split("\n")) {
    const ts = LINE_TS.exec(line);
    if (!ts) continue;
    const t = new Date(year, +ts[1] - 1, +ts[2], +ts[3], +ts[4], +ts[5], +ts[6]).getTime();

    if (line.includes("reportLocation Location[gps")) {
      const m = line.match(/gps ([\d.-]+),([\d.-]+).*?alt=([\d.-]+) vel=([\d.eE-]+) bear=([\d.-]+)/);
      if (m) {
        fixes.push({ t, lat: +m[1], lon: +m[2], alt: +m[3], speedKmh: +m[4] * 3.6, bearing: +m[5] });
      }
      continue;
    }
    if (line.includes("SdvcService: gain is")) {
      const m = line.match(/speed ([\d.]+)km\/h/);
      if (m) {
        const kmh = +m[1];
        if (kmh !== lastSpeed || speeds.length === 0 || t - speeds[speeds.length - 1].t > 5000) {
          speeds.push({ t, kmh });
          lastSpeed = kmh;
        }
      }
      continue;
    }
    if (line.includes("setSteeWheel angle =")) {
      const m = line.match(/angle = (-?\d+)\s+angleDirection = (-?\d+)\s+speed = (-?\d+)/);
      if (m) steering.push({ t, angle: +m[1], direction: +m[2], speed: +m[3] });
      continue;
    }
    if (/reverse|RvcVehicle.*gear/i.test(line) && /gear|reverse/i.test(line)) {
      events.push({ t, kind: "gear", label: line.slice(31, 140).trim() });
    } else if (/\b(ACC|ignition)\b.*(on|off)/i.test(line)) {
      events.push({ t, kind: "power", label: line.slice(31, 140).trim() });
    } else if (/onLocationChanged/.test(line) === false && /"event_name":"打开APP"/.test(line)) {
      const app = line.match(/"app_name":"([^"]+)"/);
      events.push({ t, kind: "app", label: `Opened app ${app?.[1] ?? ""}` });
    }
  }

  const dedupFixes = fixes.filter(
    (f, i) => i === 0 || f.t - fixes[i - 1].t > 200,
  );
  return { fileName, fixes: dedupFixes, speeds, steering, events: events.slice(0, 500) };
}

export function haversineKm(a: GpsFix, b: GpsFix) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function summarize(p: ParsedLog) {
  let dist = 0;
  for (let i = 1; i < p.fixes.length; i++) dist += haversineKm(p.fixes[i - 1], p.fixes[i]);
  const all = [...p.fixes.map((f) => f.t), ...p.speeds.map((s) => s.t), ...p.steering.map((s) => s.t)];
  const start = all.length ? Math.min(...all) : 0;
  const end = all.length ? Math.max(...all) : 0;
  const maxSpeed = Math.max(0, ...p.speeds.map((s) => s.kmh), ...p.fixes.map((f) => f.speedKmh));
  const maxSteer = Math.max(0, ...p.steering.map((s) => Math.abs(s.angle)));
  return { dist, start, end, maxSpeed, maxSteer };
}

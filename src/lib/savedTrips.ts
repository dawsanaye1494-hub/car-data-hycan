import type { GpsFix, SpeedSample, SteerSample, LogEvent } from "@/lib/logParser";

export type SavedTrip = { id: string; name: string; savedAt: number; fixes: GpsFix[]; speeds: SpeedSample[]; steering: SteerSample[]; events: LogEvent[] };

const KEY = "drivelog.trips.v1";

export function listTrips(): SavedTrip[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as SavedTrip[]; } catch { return []; }
}

export function saveTrip(t: Omit<SavedTrip, "id" | "savedAt">): SavedTrip {
  const trip: SavedTrip = { ...t, id: crypto.randomUUID(), savedAt: Date.now() };
  const all = [trip, ...listTrips()];
  while (all.length) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); break; } catch { all.pop(); } // drop oldest if storage full
  }
  return trip;
}

export function deleteTrip(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listTrips().filter((t) => t.id !== id)));
}

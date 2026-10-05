import type { SpeedSample, SteerSample } from "@/lib/logParser";

export type Score = { total: number; speed: number; steering: number; accel: number; tips: string[]; harshAccel: number; harshBrake: number; sharpTurns: number; overSpeed: number };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function drivingScore(speeds: SpeedSample[], steer: SteerSample[], limitKmh = 90): Score {
  let harshAccel = 0, harshBrake = 0, sharpTurns = 0, overSpeed = 0;
  for (let i = 1; i < speeds.length; i++) {
    const a = speeds[i - 1]!, b = speeds[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > 10) continue;
    const acc = (b.kmh - a.kmh) / dt; // km/h per second
    if (acc > 12) harshAccel++;
    if (acc < -14) harshBrake++;
  }
  for (const s of speeds) if (s.kmh > limitKmh) overSpeed++;
  for (let i = 1; i < steer.length; i++) {
    const a = steer[i - 1]!, b = steer[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > 5) continue;
    const da = Math.abs((b.direction ? b.angle : -b.angle) - (a.direction ? a.angle : -a.angle));
    const rate = da / dt;
    if (rate > 180 && (b.speed ?? 0) > 20) sharpTurns++;
  }
  const overPct = speeds.length ? (overSpeed / speeds.length) * 100 : 0;
  const speed = clamp(100 - overPct * 2);
  const steering = clamp(100 - sharpTurns * 8);
  const accel = clamp(100 - harshAccel * 6 - harshBrake * 8);
  const total = clamp(speed * 0.35 + steering * 0.3 + accel * 0.35);
  const tips: string[] = [];
  if (overPct > 5) tips.push(`You were above ${limitKmh} km/h ${overPct.toFixed(0)}% of the time — ease off to stay within limits.`);
  if (harshAccel) tips.push(`${harshAccel} hard acceleration${harshAccel > 1 ? "s" : ""} — press the pedal gradually to save fuel/battery.`);
  if (harshBrake) tips.push(`${harshBrake} hard braking event${harshBrake > 1 ? "s" : ""} — leave more distance to the car in front.`);
  if (sharpTurns) tips.push(`${sharpTurns} quick steering move${sharpTurns > 1 ? "s" : ""} at speed — slow down before turns and steer smoothly.`);
  if (!tips.length) tips.push(speeds.length || steer.length ? "Smooth driving so far — keep it up!" : "Start driving to see your score.");
  return { total, speed, steering, accel, tips, harshAccel, harshBrake, sharpTurns, overSpeed };
}

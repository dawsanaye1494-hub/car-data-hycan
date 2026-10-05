#!/usr/bin/env node
// Drive Log live bridge: streams the head unit's logcat to the Drive Log "Live" page.
// Requirements: Node.js 18+ and adb (Android platform-tools) on this computer,
// head unit connected via USB debugging or `adb connect <head-unit-ip>:5555`.
// Run:  node headunit-bridge.mjs        (then open Drive Log → Live → Connect)
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = Number(process.env.PORT || 8765);
const FILTER = /reportLocation|SdvcService: gain is|setSteeWheel angle|RvcVehicle|gear|reverse|ACC|ignition/i;
const clients = new Set();

function startAdb() {
  const adb = spawn("adb", ["logcat", "-v", "threadtime", "-T", "1"]);
  let buf = "";
  adb.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    const keep = lines.filter((l) => FILTER.test(l));
    if (!keep.length) return;
    const msg = `data: ${JSON.stringify(keep)}\n\n`;
    for (const res of clients) res.write(msg);
  });
  adb.stderr.on("data", (d) => console.error("adb:", d.toString().trim()));
  adb.on("exit", (code) => {
    console.error(`adb logcat exited (${code}). Retrying in 3s…`);
    setTimeout(startAdb, 3000);
  });
}

http
  .createServer((req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Private-Network": "true" };
    if (req.method === "OPTIONS") return res.writeHead(204, { ...cors, "Access-Control-Allow-Headers": "*" }).end();
    if (req.url !== "/stream") return res.writeHead(404, cors).end("Use /stream");
    res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  })
  .listen(PORT, () => console.log(`Bridge ready: http://localhost:${PORT}/stream`));

startAdb();

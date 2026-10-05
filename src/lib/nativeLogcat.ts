// Talks to the HeadUnitLogcat native plugin (only present inside the Android APK).
type Handle = { remove: () => void };
type Plugin = {
  start: (o: { root: boolean }) => Promise<{ mode: string }>;
  stop: () => Promise<void>;
  addListener: (ev: "lines" | "error", cb: (d: { lines?: string[]; message?: string }) => void) => Promise<Handle> | Handle;
};

function plugin(): Plugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return (cap.Plugins?.["HeadUnitLogcat"] as Plugin) ?? null;
}

export const hasNativeLogcat = () => !!plugin();

export async function startNative(onLines: (l: string[]) => void, onError: (m: string) => void) {
  const p = plugin();
  if (!p) throw new Error("Native reader not available");
  const h1 = await p.addListener("lines", (d) => d.lines && onLines(d.lines));
  const h2 = await p.addListener("error", (d) => onError(d.message ?? "error"));
  const res = await p.start({ root: true });
  return {
    mode: res.mode,
    stop: () => { h1.remove(); h2.remove(); void p.stop(); },
  };
}

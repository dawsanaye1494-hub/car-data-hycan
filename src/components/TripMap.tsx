import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GpsFix } from "@/lib/logParser";

export default function TripMap({ fixes, cursor }: { fixes: GpsFix[]; cursor: GpsFix | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true }).setView([16.82, 96.18], 13);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO",
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    if (!fixes.length) return;
    const pts = fixes.map((f) => [f.lat, f.lon] as [number, number]);
    L.polyline(pts, { color: "#f5b335", weight: 4 }).addTo(layer.current);
    L.circleMarker(pts[0], { radius: 7, color: "#22c55e", fillOpacity: 1 }).bindTooltip("Start").addTo(layer.current);
    L.circleMarker(pts[pts.length - 1], { radius: 7, color: "#ef4444", fillOpacity: 1 }).bindTooltip("End").addTo(layer.current);
    const b = L.latLngBounds(pts);
    map.current.fitBounds(b.pad(0.3), { maxZoom: 17 });
  }, [fixes]);

  useEffect(() => {
    if (!map.current) return;
    if (!cursor) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.circleMarker([cursor.lat, cursor.lon], { radius: 9, color: "#fff", fillColor: "#f5b335", fillOpacity: 1, weight: 3 }).addTo(map.current);
    } else marker.current.setLatLng([cursor.lat, cursor.lon]);
  }, [cursor]);

  return <div ref={el} className="h-full w-full rounded-lg" />;
}

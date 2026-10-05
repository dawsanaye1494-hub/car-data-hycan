import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/live" });
  },
  head: () => ({
    meta: [
      { title: "Drive Log — Live Head Unit Data" },
      { name: "description", content: "Real-time GPS, speed, and steering data from your car head unit." },
      { property: "og:title", content: "Drive Log — Live Head Unit Data" },
      { property: "og:description", content: "Real-time GPS, speed, and steering data from your car head unit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

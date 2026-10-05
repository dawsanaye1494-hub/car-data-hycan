import { createFileRoute } from "@tanstack/react-router";

const SYSTEM = `You are a friendly driving coach. You receive a compact summary of one car trip parsed from a head unit log (GPS fixes, vehicle speed samples, steering wheel angle readings, notable events).
Explain in plain language, using short markdown sections:
1. Trip overview (when, how long, distance, whether the car was mostly parked or driving)
2. Driving patterns (speed behaviour, stops, steering/manoeuvres such as parking or turning)
3. Notable events with their times
4. Practical tips (2-4 bullets)
Be honest when data is sparse. Keep it under 300 words. Do not invent data not present.`;

export const Route = createFileRoute("/api/analyze-trip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return Response.json({ error: "AI is not configured." }, { status: 500 });
        let body: { summary?: unknown };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }
        const summary = JSON.stringify(body.summary ?? null);
        if (!body.summary || summary.length > 60000) {
          return Response.json({ error: "Trip data missing or too large." }, { status: 400 });
        }
        const { createResponsesCall } = await import("@/lib/ai/responses.server");
        const call = createResponsesCall(
          request,
          { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
          [
            { role: "user", content: `${SYSTEM}\n\nTrip data:\n${summary}` },
          ],
        );
        return call.result.toTextStreamResponse();
      },
    },
  },
});

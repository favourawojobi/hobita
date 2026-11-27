import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";

const cache = new Map<string, ArrayBuffer>();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = (body.text || "").trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > 400) {
      return NextResponse.json({ error: "text too long" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "voice_not_configured", text },
        { status: 503 },
      );
    }

    const voiceId =
      process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const key = createHash("sha256").update(`${voiceId}:${text}`).digest("hex");

    let audio = cache.get(key);
    if (!audio) {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.75,
              style: 0.2,
              use_speaker_boost: true,
            },
          }),
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        return NextResponse.json(
          {
            error: "elevenlabs_failed",
            detail: detail.slice(0, 200),
            text,
          },
          { status: 502 },
        );
      }

      audio = await response.arrayBuffer();
      if (cache.size > 40) cache.clear();
      cache.set(key, audio);
    }

    return new Response(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "public, max-age=86400",
        "x-hobita-script": encodeURIComponent(text),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "voice_failed",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}

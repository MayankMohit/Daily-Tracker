// Low-level Gemini client (plan §4). Dependency-free: talks to the Generative
// Language REST API directly, matching the project's frugal style.
//
// Configure with GEMINI_API_KEY in .env.local. Optionally override the model
// with GEMINI_MODEL (defaults to a fast, cheap flash model).

const API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Whether a Gemini key is present. UI/services degrade gracefully when false. */
export const aiConfigured = Boolean(API_KEY);

/** Thrown for any AI failure; callers turn this into a friendly message / 503. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface GenerateOptions {
  system?: string;
  /** Ask for strict JSON back (responseMimeType + optional schema). */
  json?: boolean;
  /** A Gemini responseSchema (implies json). */
  schema?: Record<string, unknown>;
  temperature?: number;
}

/** Single-shot text (or JSON) generation. Returns the raw model text. */
export async function generateText(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  if (!aiConfigured) {
    throw new AiError("AI is not configured (missing GEMINI_API_KEY).", 503);
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      ...(opts.json || opts.schema
        ? { responseMimeType: "application/json" }
        : {}),
      ...(opts.schema ? { responseSchema: opts.schema } : {}),
    },
  };
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Don't let a slow model hang a request forever.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new AiError(
      e instanceof Error && e.name === "TimeoutError"
        ? "The AI request timed out. Please try again."
        : "Could not reach the AI service.",
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AiError(
      `AI request failed (${res.status}). ${detail.slice(0, 200)}`,
      res.status === 429 ? 429 : 502,
    );
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new AiError(
      `The AI declined to respond (${data.promptFeedback.blockReason}).`,
    );
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) throw new AiError("The AI returned an empty response.");
  return text;
}

/** Generate + parse JSON. Tolerates code-fenced output. */
export async function generateJson<T>(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<T> {
  const raw = await generateText(prompt, { ...opts, json: true });
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new AiError("The AI returned malformed JSON.");
  }
}

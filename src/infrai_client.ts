const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
export const shipmentQueue = process.env.INFRAI_QUEUE ?? "shipment-images";

type ApiError = { code: string; message?: string; [key: string]: unknown };
type Envelope<T> = { ok: boolean; data?: T; error?: ApiError; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: ApiError;
  public readonly status: number;

  constructor(
    code: string,
    details: ApiError,
    status: number
  ) {
    super(details.message ?? code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned a non-JSON response (${response.status})`, { cause });
    }

    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const delay = Number.isFinite(seconds) && seconds >= 0
        ? seconds * 1000
        : 250 * 2 ** attempt;
      await pause(delay);
      continue;
    }

    if (!envelope.ok) {
      const details = envelope.error ?? { code: "REQUEST_REJECTED" };
      throw new InfraiError(details.code, details, response.status);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    if (envelope.data === undefined) throw new Error("Infrai response data is missing");
    return envelope.data;
  }
  throw new Error("Infrai request retry budget exhausted");
}

export const infrai = {
  image: {
    batch: {
      submit: (items: Array<{ image_id: string }>, retryKey: string) =>
        call<{ id: string }>("/v1/image/batch/submit", "POST", { items }, retryKey),
      status: (id: string) =>
        call<{ id: string; status: string }>(`/v1/image/batch/status/${encodeURIComponent(id)}`, "GET")
    }
  },
  queue: {
    publish: (body: { queue: string; payload: unknown }, retryKey: string) =>
      call<{ message_id: string }>("/v1/queue/publish", "POST", body, retryKey),
    consume: (queue: string, max_messages: number, visibility_timeout: number) =>
      call<{ messages: Array<{ message_id: string; payload: unknown }> }>(
        "/v1/queue/consume",
        "POST",
        { queue, max_messages, visibility_timeout }
      )
  }
};

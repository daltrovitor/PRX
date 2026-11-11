/** Bound initial reads so one optional service cannot trap the opening screen. */
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    // Consume JSON within the same timeout; response headers alone are not ready.
    const text = await response.text();
    return new Response(text || null, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

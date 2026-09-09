/**
 * Reads a JSON body without assuming the server actually sent one.
 *
 * A crashed route, a proxy timeout, or an HTML error page all yield a
 * response that `res.json()` chokes on with "Unexpected end of JSON input" —
 * a parse error the user sees instead of the real problem. This returns
 * `null` for any unparseable body so callers can fall back to the status.
 */
export async function readJson<T = any>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Best-effort error message from a failed response. */
export async function readError(res: Response, fallback: string): Promise<string> {
  const data = await readJson<{ error?: string }>(res);
  if (data?.error) return data.error;
  if (res.status >= 500) return "The server had a problem. Please try again later.";
  return fallback;
}

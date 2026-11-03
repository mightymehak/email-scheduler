import { API_URL } from './config';

// An error response from our API: { error: string, fields?: { name: [messages] } }.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    // Per-field validation messages (400 responses), for showing next to form inputs.
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

// The single place the app talks to the backend.
export async function apiFetch<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      // Sends the httpOnly session cookie the API set at login. JS can't read that cookie;
      // the browser attaches it because the API allows credentials from this origin (CORS).
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // An abort is not an error the user needs to see (React Query cancels stale requests).
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server. Is the API running?');
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, fields } = (data ?? {}) as { error?: string; fields?: Record<string, string[]> };
    throw new ApiError(res.status, error ?? `Request failed (${res.status})`, fields);
  }
  return data as T;
}

// Turns any thrown value into a sentence for the UI.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

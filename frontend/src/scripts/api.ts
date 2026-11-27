import { formatApiError } from '../lib/api-errors.mjs';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, data?: unknown, method?: string): Promise<T> {
  const response = await fetch('/api' + path, {
    method: method ?? (data === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MathGarden' },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: 'no-store',
  });
  if (!response.ok) {
    let detail = 'خطا در ارتباط با سرویس';
    try {
      const payload = await response.json();
      if (typeof payload.detail === 'string') detail = payload.detail;
    } catch {}
    throw new ApiError(response.status, detail);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const message = (error: unknown) => {
  if (error instanceof ApiError) {
    return formatApiError(error.status, error.message);
  }
  return error instanceof Error ? error.message : 'خطای موقت';
};

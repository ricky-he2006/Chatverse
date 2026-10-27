import type { Mode } from '../shared/types';
let csrf = '';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export function setCsrf(value: string) {
  csrf = value;
}
export async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers },
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.message ?? 'The request could not be completed.',
      response.status,
      body.code ?? 'REQUEST_FAILED',
    );
  return body;
}
export const mutate = <T = any>(mode: Mode, path: string, body: unknown = {}, method = 'POST') =>
  request<T>(`/api/${mode}/${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });

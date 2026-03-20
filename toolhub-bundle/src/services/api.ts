const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const SERVICE_TOKEN = import.meta.env.VITE_SERVICE_TOKEN || ''

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Token': SERVICE_TOKEN,
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

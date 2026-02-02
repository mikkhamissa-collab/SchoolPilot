// API helper for calling our Next.js API routes (which proxy to Flask)

export async function apiFetch<T = unknown>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`/api/ai/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data as T;
}

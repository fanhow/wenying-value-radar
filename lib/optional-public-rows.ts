export async function optionalPublicRows<T>(url: string, fetcher: typeof fetch = fetch): Promise<T[]> {
  try {
    const response = await fetcher(url, {
      next: { revalidate: 60 * 60 * 6 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? payload as T[] : [];
  } catch {
    return [];
  }
}

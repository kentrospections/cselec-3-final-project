export async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const url = typeof window === "undefined" ? "http://cselec-3-backend:8000/graphql" : "/graphql"
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })
  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors[0].message)
  }
  return json.data as T
}

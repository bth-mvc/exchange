export type Req = (method: string, path: string, body?: unknown) => Promise<Response>

export function makeClient(baseUrl: string, apiKey: string): Req {
  return (method, path, body) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
}

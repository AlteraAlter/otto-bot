// FastAPI returns a couple of different error shapes, so we normalize them once
// and keep page-level submit handlers easy to scan.
export function readApiErrorMessage(
  payload: unknown,
  fallback: string,
  status?: number,
): string {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  if (Array.isArray(payload)) {
    const firstMessage = payload.find(
      (item) =>
        item &&
        typeof item === "object" &&
        "msg" in item &&
        typeof item.msg === "string",
    ) as { msg: string } | undefined;

    if (firstMessage) {
      return firstMessage.msg;
    }
  }

  return typeof status === "number" ? `${fallback} (${status})` : fallback;
}

export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../lib/auth";

type Params = { params: Promise<{ processId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { processId } = await params;
  const response = await fetch(
    withBackendPath(`/v1/products/tasks/attribute-fill/${encodeURIComponent(processId)}`),
    {
      method: "GET",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );

  return toClientResponse(response);
}

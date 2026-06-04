import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../../lib/auth";

type Params = { params: Promise<{ processId: string }> };

export async function POST(request: Request, { params }: Params) {
  const { processId } = await params;
  const body = await request.text();
  const response = await fetch(
    withBackendPath(
      `/v1/products/tasks/create-from-factory/${encodeURIComponent(processId)}/enrich`,
    ),
    {
      method: "POST",
      headers: await getAuthorizedHeaders({
        "content-type": "application/json",
      }),
      body,
      cache: "no-store",
    },
  );
  return toClientResponse(response);
}

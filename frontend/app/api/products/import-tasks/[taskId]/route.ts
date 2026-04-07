import { toClientResponse, getAuthorizedHeaders, withBackendPath } from "../../../../../lib/auth";

type Params = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { taskId } = await params;
  const response = await fetch(withBackendPath(`/v1/products/import-tasks/${taskId}`), {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}

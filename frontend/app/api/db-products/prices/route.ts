import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function PATCH(request: Request) {
  const body = await request.text();
  const response = await fetch(withBackendPath("/v1/products/db/prices"), {
    method: "PATCH",
    headers: await getAuthorizedHeaders({
      "content-type": "application/json",
    }),
    body,
    cache: "no-store",
  });

  return toClientResponse(response);
}

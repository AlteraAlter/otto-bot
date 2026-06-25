import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../lib/auth";

export async function POST(request: Request) {
  const response = await fetch(
    withBackendPath("/v1/products/variant-image/generate"),
    {
      method: "POST",
      headers: await getAuthorizedHeaders({
        "content-type": "application/json",
      }),
      body: await request.text(),
      cache: "no-store",
    },
  );

  return toClientResponse(response);
}

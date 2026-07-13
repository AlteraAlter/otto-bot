import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const body = await request.text();
  const response = await fetch(withBackendPath("/v1/products/tasks/attribute-fill"), {
    method: "POST",
    headers: await getAuthorizedHeaders({
      "content-type": "application/json",
    }),
    body,
    cache: "no-store",
  });

  return toClientResponse(response);
}

export async function GET() {
  const response = await fetch(withBackendPath("/v1/products/tasks/attribute-fill/latest"), {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}

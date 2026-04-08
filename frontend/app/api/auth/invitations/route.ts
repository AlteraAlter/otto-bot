import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function GET() {
  const response = await fetch(withBackendPath("/v1/auth/invitations"), {
    method: "GET",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}

export async function DELETE() {
  const response = await fetch(withBackendPath("/v1/auth/invitations"), {
    method: "DELETE",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}

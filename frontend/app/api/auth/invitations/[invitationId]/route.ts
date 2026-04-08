import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../lib/auth";

type RouteContext = {
  params: Promise<{
    invitationId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const { invitationId } = await context.params;

  const response = await fetch(withBackendPath(`/v1/auth/invitations/${invitationId}`), {
    method: "DELETE",
    headers: await getAuthorizedHeaders(),
    cache: "no-store",
  });

  return toClientResponse(response);
}

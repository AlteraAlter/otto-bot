import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../../lib/auth";

type Params = { productId: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  const { productId } = await params;
  const response = await fetch(
    withBackendPath(`/v1/products/${encodeURIComponent(productId)}/variants`),
    {
      method: "GET",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );

  return toClientResponse(response);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  const { productId } = await params;
  const response = await fetch(
    withBackendPath(`/v1/products/${encodeURIComponent(productId)}/variants/generate`),
    {
      method: "POST",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return NextResponse.json({ success: false, message: "Product variants are not available for this product yet." }, { status: 404 });
  }

  return toClientResponse(response);
}

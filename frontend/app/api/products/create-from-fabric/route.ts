import { NextResponse } from "next/server";

import {
  getAuthorizedHeaders,
  toClientResponse,
  withBackendPath,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  const body = await request.text();
  try {
    const response = await fetch(
      withBackendPath("/v1/products/tasks/create-from-factory"),
      {
        method: "POST",
        headers: await getAuthorizedHeaders({
          "content-type": "application/json",
        }),
        body,
        cache: "no-store",
      },
    );

    if (response.status === 504) {
      return NextResponse.json(
        {
          success: true,
          process_state: "IN_PROGRESS",
          process_id: null,
          issues: [
            "Запрос обрабатывается дольше обычного. Процесс запущен, проверьте статус чуть позже.",
          ],
          message: "Processing is still running",
        },
        { status: 200 },
      );
    }

    return toClientResponse(response);
  } catch {
    return NextResponse.json(
      {
        success: true,
        process_state: "IN_PROGRESS",
        process_id: null,
        issues: [
          "Сеть/шлюз не дождались ответа, но процесс мог продолжиться в фоне. Проверьте статус позже.",
        ],
        message: "Processing may still be running",
      },
      { status: 200 },
    );
  }
}

export async function DELETE() {
  const response = await fetch(
    withBackendPath("/v1/products/tasks/create-from-factory"),
    {
      method: "DELETE",
      headers: await getAuthorizedHeaders(),
      cache: "no-store",
    },
  );
  return toClientResponse(response);
}

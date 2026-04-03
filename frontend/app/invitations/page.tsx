"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { useCurrentUser } from "../hooks/use-current-user";
import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { AuthShell } from "../ui/auth-shell";

type InviteResponse = {
  success: boolean;
  email: string;
  role: "SEO" | "EMPLOYEE";
  expires_at: string;
};

export default function InvitationsPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [lastInvite, setLastInvite] = useState<InviteResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentUser?.role !== "SEO") {
      setMessageTone("error");
      setMessage("Недостаточно прав для отправки приглашения.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setLastInvite(null);

    try {
      const response = await fetch("/api/auth/invite-employee", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const parsed = await readJsonResponse<InviteResponse>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(
          readApiErrorMessage(parsed, "Не удалось отправить приглашение", response.status),
        );
        return;
      }

      if (parsed) {
        setLastInvite(parsed);
        setMessageTone("success");
        setMessage("Приглашение отправлено.");
      }
      setEmail("");
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Ошибка отправки приглашения",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <AuthShell
        title="Проверяем доступ"
        description="Загружаем профиль и права текущего пользователя."
      >
        <p className="helper-banner info">Пожалуйста, подождите...</p>
      </AuthShell>
    );
  }

  const isSeoUser = currentUser?.role === "SEO";
  const accessMessage =
    error ??
    (!isSeoUser ? "Только SEO-пользователь может отправлять приглашения." : null);

  return (
    <AuthShell
      title="Приглашения сотрудников"
      description="Отправьте приглашение на Gmail, и сотрудник завершит регистрацию уже с нужной ролью и привязкой к вашему рабочему процессу."
      sideContent={
        <div className="auth-note">
          <p>Текущий пользователь:</p>
          <strong>{currentUser?.email ?? "неизвестно"}</strong>
          <Link className="auth-link" href="/">
            Назад в панель
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-stack">
          <label className="field">
            <span>Gmail адрес сотрудника</span>
            <input
              autoComplete="email"
              className="text-input"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employee.name@gmail.com"
              required
              type="email"
              value={email}
            />
          </label>

          <p className="auth-hint">
            Приглашение отправится на Gmail и позволит зарегистрировать только
            пользователя с ролью EMPLOYEE.
          </p>

          {accessMessage ? <p className="helper-banner">{accessMessage}</p> : null}
          {message ? (
            <p className={`helper-banner ${messageTone === "success" ? "success" : ""}`}>
              {message}
            </p>
          ) : null}

          {lastInvite ? (
            <div className="invite-summary">
              <p>
                Отправлено на: <strong>{lastInvite.email}</strong>
              </p>
              <p>
                Роль: <strong>{lastInvite.role}</strong>
              </p>
              <p>
                Истекает:{" "}
                <strong>{new Date(lastInvite.expires_at).toLocaleString()}</strong>
              </p>
            </div>
          ) : null}

          <button
            className="primary-btn full"
            disabled={!isSeoUser || isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Отправляем..." : "Отправить приглашение"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

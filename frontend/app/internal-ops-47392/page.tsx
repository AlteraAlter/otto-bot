"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { useCurrentUser } from "../hooks/use-current-user";
import { readApiErrorMessage } from "../lib/api";
import { AuthShell } from "../ui/auth-shell";

type Role = "SEO" | "EMPLOYEE";

export default function InternalOpsPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentUser?.role !== "SEO") {
      setMessageTone("error");
      setMessage("Недостаточно прав для создания пользователя.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/admin-create-user", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          last_name: lastName,
          email,
          password,
          role,
        }),
      });

      if (!response.ok) {
        let detail = "Не удалось создать пользователя";
        try {
          const payload: unknown = await response.json();
          detail = readApiErrorMessage(payload, detail, response.status);
        } catch {
          detail = `${detail} (${response.status})`;
        }
        setMessageTone("error");
        setMessage(detail);
        return;
      }

      setName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      setMessageTone("success");
      setMessage("Пользователь создан.");
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error ? error.message : "Ошибка создания пользователя",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <AuthShell
        title="Проверяем доступ"
        description="Загружаем данные текущего пользователя."
      >
        <p className="helper-banner info">Пожалуйста, подождите...</p>
      </AuthShell>
    );
  }

  const isSeoUser = currentUser?.role === "SEO";
  const accessMessage =
    error ??
    (!isSeoUser ? "Только SEO-пользователь может создавать новых пользователей." : null);

  return (
    <AuthShell
      title="Внутреннее создание пользователей"
      description="Страница не видна в навигации и ведёт в тот же backend flow создания пользователя, что и остальные служебные сценарии."
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
            <span>Имя</span>
            <input
              className="text-input"
              onChange={(event) => setName(event.target.value)}
              required
              type="text"
              value={name}
            />
          </label>

          <label className="field">
            <span>Фамилия</span>
            <input
              className="text-input"
              onChange={(event) => setLastName(event.target.value)}
              required
              type="text"
              value={lastName}
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              className="text-input"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Пароль</span>
            <input
              className="text-input"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <label className="field">
            <span>Роль</span>
            <select
              className="text-input"
              onChange={(event) => setRole(event.target.value as Role)}
              value={role}
            >
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="SEO">SEO</option>
            </select>
          </label>

          <p className="auth-hint">
            Используется тот же backend-код создания пользователя, что и для остальных flows.
          </p>

          {accessMessage ? <p className="helper-banner">{accessMessage}</p> : null}
          {message ? (
            <p className={`helper-banner ${messageTone === "success" ? "success" : ""}`}>
              {message}
            </p>
          ) : null}

          <button
            className="primary-btn full"
            disabled={!isSeoUser || isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Создаём пользователя..." : "Создать пользователя"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}

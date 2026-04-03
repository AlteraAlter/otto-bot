"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { readApiErrorMessage } from "../lib/api";
import { AuthShell } from "../ui/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(
    searchParams.get("expired") ? "Сессия истекла. Войдите снова." : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        let detail = "Не удалось выполнить вход";
        try {
          const payload: unknown = await response.json();
          detail = readApiErrorMessage(payload, detail, response.status);
        } catch {
          detail = `${detail} (${response.status})`;
        }
        setMessage(detail);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка входа");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Вход в рабочее пространство OTTO"
      description="Спокойный, прямой вход без лишних шагов. Авторизуйтесь, чтобы открыть каталог, создание товаров и служебные инструменты."
      sideContent={
        <div className="auth-note">
          <p>Что доступно после входа:</p>
          <ul className="auth-list">
            <li>каталог товаров и массовые действия</li>
            <li>создание новых товаров</li>
            <li>приглашения сотрудников для SEO</li>
          </ul>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-stack">
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
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
              autoComplete="current-password"
              className="text-input"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {message ? <p className="helper-banner">{message}</p> : null}

          <button className="primary-btn full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Входим..." : "Войти"}
          </button>
        </div>

        <p className="auth-footer">
          Самостоятельная регистрация отключена.{" "}
          <Link className="auth-link" href="/register">
            Посмотреть правила доступа
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

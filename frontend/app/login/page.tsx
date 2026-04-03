"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
          const payload = (await response.json()) as { detail?: string };
          if (payload.detail) {
            detail = payload.detail;
          }
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
    <main className="login-page">
      <section className="login-shell">
        <div className="login-hero">
          <p className="brand">OTTO Контроль</p>
          <h1>Вход в панель управления товарами</h1>
          <p className="login-copy">
            Авторизуйтесь локальным аккаунтом, чтобы работать с защищённым API
            продуктов.
          </p>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
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

          <p className="auth-footer">
            Нет аккаунта?{" "}
            <Link className="auth-link" href="/register">
              Зарегистрироваться
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

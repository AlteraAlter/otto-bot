"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function readErrorMessage(
  payload: unknown,
  fallback: string,
  status: number,
): string {
  if (
    payload &&
    typeof payload === "object" &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }
  if (Array.isArray(payload)) {
    const firstMessage = payload.find(
      (item) =>
        item &&
        typeof item === "object" &&
        "msg" in item &&
        typeof item.msg === "string",
    ) as { msg: string } | undefined;
    if (firstMessage) {
      return firstMessage.msg;
    }
  }
  return `${fallback} (${status})`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name, last_name: lastName, email, password }),
      });

      if (!response.ok) {
        let detail = "Не удалось выполнить регистрацию";
        try {
          const payload: unknown = await response.json();
          detail = readErrorMessage(payload, detail, response.status);
        } catch {
          detail = `${detail} (${response.status})`;
        }
        setMessage(detail);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ошибка регистрации",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <div className="login-hero">
          <p className="brand">OTTO Контроль</p>
          <h1>Регистрация в панели управления товарами</h1>
          <p className="login-copy">
            Создайте локальный аккаунт и сразу получите доступ к защищённому
            API продуктов.
          </p>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          <label className="field">
            <span>Имя</span>
            <input
              autoComplete="given-name"
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
              autoComplete="family-name"
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
              autoComplete="new-password"
              className="text-input"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <p className="auth-hint">
            Минимум 8 символов, с заглавной буквой, строчной буквой, цифрой и
            спецсимволом.
          </p>

          {message ? <p className="helper-banner">{message}</p> : null}

          <button className="primary-btn full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Создаём аккаунт..." : "Зарегистрироваться"}
          </button>

          <p className="auth-footer">
            Уже есть аккаунт?{" "}
            <Link className="auth-link" href="/login">
              Войти
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

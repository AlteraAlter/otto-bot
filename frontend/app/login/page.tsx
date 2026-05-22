"use client";

import Link from "next/link";
import { Suspense, FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { readApiErrorMessage } from "../lib/api";
import { AuthShell } from "../ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginPageContent() {
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
        signal: AbortSignal.timeout(12000),
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
      if (error instanceof Error && error.name === "TimeoutError") {
        setMessage("Таймаут входа. Проверьте соединение и попробуйте снова.");
      } else {
        setMessage(error instanceof Error ? error.message : "Ошибка входа");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title=""
      description=""
      compact
    >
      <form onSubmit={handleSubmit}>
        <div className="form-stack">
          <label className="field">
            <span>Email</span>
            <Input
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
            <Input
              autoComplete="current-password"
              className="text-input"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {message ? <p className="helper-banner">{message}</p> : null}

          <Button className="primary-btn full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Входим..." : "Войти"}
          </Button>
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          title=""
          description=""
          compact
        >
          <p className="helper-banner info">Пожалуйста, подождите...</p>
        </AuthShell>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}

"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthShell } from "../ui/auth-shell";
import { Button } from "@/components/ui/button";

type RegisterState = "idle" | "loading" | "error";

export default function RegisterPage() {
  const router = useRouter();
  const [state, setState] = useState<RegisterState>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      last_name: String(form.get("last_name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        setState("error");
        setError(text || `Registration failed (${response.status})`);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (caughtError) {
      setState("error");
      setError(caughtError instanceof Error ? caughtError.message : "Registration failed");
    }
  }

  return (
    <AuthShell
      title="Регистрация"
      description="Создайте аккаунт для работы с каталогом и задачами."
    >
      <form className="form-stack" onSubmit={handleSubmit}>
        {error ? <p className="helper-banner error">{error}</p> : null}

        <label className="field">
          <span>Имя</span>
          <input name="name" required type="text" />
        </label>

        <label className="field">
          <span>Фамилия</span>
          <input name="last_name" required type="text" />
        </label>

        <label className="field">
          <span>Email</span>
          <input name="email" required type="email" />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input name="password" required type="password" minLength={8} />
        </label>

        <Button className="primary-btn full" disabled={state === "loading"} type="submit">
          {state === "loading" ? "Создание..." : "Создать аккаунт"}
        </Button>

        <p className="auth-hint">
          Уже есть аккаунт? <Link href="/login">Войти</Link>
        </p>
      </form>
    </AuthShell>
  );
}

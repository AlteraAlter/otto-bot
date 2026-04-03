"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { readApiErrorMessage } from "../lib/api";
import { AuthShell } from "../ui/auth-shell";

export default function EmployeeRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasInvitation, setHasInvitation] = useState(false);

  useEffect(() => {
    // The invite page is driven by email links, so we capture the URL once and
    // lock those values into the form instead of letting the user drift away
    // from the invited email/token pair.
    const params = new URLSearchParams(window.location.search);
    const invite =
      params.get("invite") ??
      params.get("code") ??
      params.get("token");
    const invitedEmail =
      params.get("email") ??
      params.get("mail");

    if (invite) {
      setInviteToken(invite);
      setHasInvitation(true);
    }
    if (invitedEmail) {
      setEmail(invitedEmail);
      setHasInvitation(true);
    }
    setIsReady(true);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inviteToken.trim()) {
      setMessage("Код приглашения обязателен.");
      return;
    }

    if (!email.trim()) {
      setMessage("Email обязателен.");
      return;
    }

    if (password !== passwordRepeat) {
      setMessage("Пароли не совпадают.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name,
          last_name: lastName,
          email,
          password,
          invite_token: inviteToken,
        }),
      });

      if (!response.ok) {
        let detail = "Не удалось выполнить регистрацию";
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
      setMessage(
        error instanceof Error ? error.message : "Ошибка регистрации",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isReady) {
    return (
      <AuthShell
        title="Подготавливаем регистрацию"
        description="Проверяем ссылку приглашения и подставляем данные в форму."
      >
        <p className="helper-banner info">Пожалуйста, подождите...</p>
      </AuthShell>
    );
  }

  if (!hasInvitation) {
    return (
      <AuthShell
        title="Приглашение не найдено"
        description="Для регистрации сотрудника нужна корректная invite-ссылка из письма."
      >
        <div className="form-stack">
          <p className="helper-banner">
            Откройте ссылку из письма заново или вставьте полный URL регистрации.
          </p>
          <Link className="auth-link" href="/login">
            Назад ко входу
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Регистрация сотрудника по приглашению"
      description="Email и код приглашения подставляются из ссылки. Заполните личные данные и задайте пароль, чтобы завершить создание аккаунта."
      sideContent={
        <div className="auth-note">
          <p>Что уже зафиксировано:</p>
          <ul className="auth-list">
            <li>email из приглашения</li>
            <li>код приглашения</li>
            <li>роль сотрудника на сервере</li>
          </ul>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-stack">
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
              readOnly
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Код приглашения</span>
            <input
              className="text-input"
              readOnly
              required
              type="text"
              value={inviteToken}
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

          <label className="field">
            <span>Повторите пароль</span>
            <input
              autoComplete="new-password"
              className="text-input"
              onChange={(event) => setPasswordRepeat(event.target.value)}
              required
              type="password"
              value={passwordRepeat}
            />
          </label>

          <p className="auth-hint">
            Используйте email из приглашения. Пароль должен содержать минимум
            8 символов, заглавную и строчную буквы, цифру и спецсимвол.
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
        </div>
      </form>
    </AuthShell>
  );
}

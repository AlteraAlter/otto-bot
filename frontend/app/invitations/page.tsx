"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useCurrentUser } from "../hooks/use-current-user";
import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";

type InviteRole = "SEO" | "EMPLOYEE";
type InvitationStatus = "pending" | "accepted" | "expired";

type InviteResponse = {
  success: boolean;
  id: number;
  email: string;
  role: InviteRole;
  expires_at: string;
};

type InvitationItem = {
  id: number;
  email: string;
  role: InviteRole;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

type InvitationListResponse = {
  success: boolean;
  items: InvitationItem[];
};

type DeleteResponse = {
  success: boolean;
  deleted_count: number;
};

const ROLE_OPTIONS: Array<{
  value: InviteRole;
  label: string;
  description: string;
}> = [
    {
      value: "EMPLOYEE",
      label: "Сотрудник",
      description: "Работа с каталогом, созданием товаров и повседневными задачами.",
    },
    {
      value: "SEO",
      label: "SEO",
      description: "Расширенный доступ к приглашениям, операциям с данными и администрированию.",
    },
  ];

const DEPARTMENT_OPTIONS = ["Редакция", "Каталог", "Операции"];

function formatInvitationStatus(status: InvitationStatus) {
  if (status === "accepted") return "Принято";
  if (status === "expired") return "Истекло";
  return "Ожидает";
}

function formatInvitationRole(role: InviteRole) {
  return role === "SEO" ? "SEO" : "Сотрудник";
}

function formatInvitationDate(value: string) {
  return new Date(value).toLocaleString();
}

function initialsFromEmail(email: string) {
  const [name] = email.split("@");
  const cleaned = name.replace(/[^a-zA-Zа-яА-Я0-9]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase() || "IV";
}

export default function InvitationsPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("EMPLOYEE");
  const [department, setDepartment] = useState(DEPARTMENT_OPTIONS[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [lastInvite, setLastInvite] = useState<InviteResponse | null>(null);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const isSeoUser = currentUser?.role === "SEO";
  const accessMessage =
    error ??
    (!isSeoUser ? "Только SEO-пользователь может управлять приглашениями." : null);

  const pendingInvitations = useMemo(
    () => invitations.filter((item) => item.status === "pending"),
    [invitations],
  );

  async function loadInvitations() {
    if (!isSeoUser) {
      setInvitations([]);
      return;
    }

    setIsLoadingInvitations(true);

    try {
      const response = await fetch("/api/auth/invitations", {
        cache: "no-store",
      });
      const parsed = await readJsonResponse<InvitationListResponse>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(
          readApiErrorMessage(parsed, "Не удалось загрузить приглашения", response.status),
        );
        return;
      }

      setInvitations(parsed?.items ?? []);
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось загрузить приглашения",
      );
    } finally {
      setIsLoadingInvitations(false);
    }
  }

  useEffect(() => {
    void loadInvitations();
  }, [isSeoUser]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSeoUser) {
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
        body: JSON.stringify({ email, role }),
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
        setMessage("Приглашение отправлено и добавлено в список ниже.");
      }
      setEmail("");
      await loadInvitations();
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(
        caughtError instanceof Error ? caughtError.message : "Ошибка отправки приглашения",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteInvitation(invitationId: number) {
    setDeletingId(invitationId);
    setMessage(null);

    try {
      const response = await fetch(`/api/auth/invitations/${invitationId}`, {
        method: "DELETE",
      });
      const parsed = await readJsonResponse<DeleteResponse>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(
          readApiErrorMessage(parsed, "Не удалось удалить приглашение", response.status),
        );
        return;
      }

      setMessageTone("success");
      setMessage("Приглашение удалено.");
      await loadInvitations();
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(
        caughtError instanceof Error ? caughtError.message : "Ошибка удаления приглашения",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAllPending() {
    setIsDeletingAll(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/invitations", {
        method: "DELETE",
      });
      const parsed = await readJsonResponse<DeleteResponse>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(
          readApiErrorMessage(parsed, "Не удалось удалить приглашения", response.status),
        );
        return;
      }

      setMessageTone("success");
      setMessage(`Удалено приглашений: ${parsed?.deleted_count ?? 0}.`);
      await loadInvitations();
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(
        caughtError instanceof Error ? caughtError.message : "Ошибка удаления приглашений",
      );
    } finally {
      setIsDeletingAll(false);
    }
  }

  if (isLoading) {
    return (
      <main className="otto-page">
        <section className="app-shell">
          <section className="workspace">
            <p className="helper-banner info">Пожалуйста, подождите...</p>
          </section>
        </section>
      </main>
    );
  }

  return (
    <AppWorkspaceShell
      activeHref="/invitations"
      currentUser={currentUser}
      sectionLabel="Команда"
      title="Приглашение сотрудников"
      description="Отправьте приглашение на почту, чтобы добавить нового участника в команду и сразу отслеживать его статус."
    >
      <div className="invitation-workspace invitation-dashboard">
        {accessMessage ? <p className="helper-banner">{accessMessage}</p> : null}
        {message ? (
          <p className={`helper-banner ${messageTone === "success" ? "success" : ""}`}>
            {message}
          </p>
        ) : null}

        <section className="invitation-hero-grid">
          <form className="invitation-form-card" onSubmit={handleSubmit}>
            <div className="invitation-card-head">
              <p className="page-section-label">Новая заявка</p>
              <h2>Отправить приглашение</h2>
            </div>

            <div className="invitation-form-grid">
              <label className="field invitation-field-full">
                <span>Email адрес</span>
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

              <label className="field">
                <span>Роль в команде</span>
                <select
                  className="text-input"
                  onChange={(event) => setRole(event.target.value as InviteRole)}
                  value={role}
                >
                  {ROLE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

            </div>

            <button
              className="primary-btn full invitation-submit-btn"
              disabled={!isSeoUser || isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Отправляем..." : "Отправить приглашение"}
            </button>


            <p className="auth-hint">
              Сейчас регистрация приглашённых сотрудников использует Gmail-ссылку из письма.
            </p>

            {lastInvite ? (
              <div className="invite-summary">
                <p>
                  Отправлено на: <strong>{lastInvite.email}</strong>
                </p>
                <p>
                  Роль: <strong>{formatInvitationRole(lastInvite.role)}</strong>
                </p>
                <p>
                  Истекает: <strong>{formatInvitationDate(lastInvite.expires_at)}</strong>
                </p>
              </div>
            ) : null}
          </form>

          <div className="invitation-side-stack">
            <article className="invitation-info-card">
              <div className="invitation-info-head">
                <span className="invitation-info-badge">i</span>
                <strong>Доступные роли</strong>
              </div>

              <div className="invitation-role-list">
                {ROLE_OPTIONS.map((item) => (
                  <div className="invitation-role-card" key={item.value}>
                    <strong>{item.label}</strong>
                    <p>{item.description}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="invitation-promo-card">
              <div className="invitation-promo-overlay">
                <strong>Стройте сильные команды вместе с OTTO Контроль</strong>
                <p>
                  Приглашения, роли и управление доступом собраны в одном понятном рабочем
                  пространстве.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="invitation-table-section">
          <div className="invitation-table-head">
            <div>
              <h2>Ожидающие приглашения</h2>
              <p>Сотрудники, которые еще не приняли ваше приглашение.</p>
            </div>
            <button
              className="ghost-btn invitation-delete-all"
              disabled={pendingInvitations.length === 0 || isDeletingAll}
              onClick={handleDeleteAllPending}
              type="button"
            >
              {isDeletingAll ? "Удаляем..." : "Удалить все"}
            </button>
          </div>

          <div className="invitation-table-card">
            {isLoadingInvitations ? (
              <div className="empty-state">Загружаем приглашения...</div>
            ) : invitations.length === 0 ? (
              <div className="empty-state">Приглашений пока нет.</div>
            ) : (
              <div className="invitation-table-scroll">
                <table className="invitation-table">
                  <thead>
                    <tr>
                      <th>Пользователь</th>
                      <th>Роль</th>
                      <th>Статус</th>
                      <th>Дата отправки</th>
                      <th aria-label="Удалить" />
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="invitation-user-cell">
                            <span className="invitation-avatar">{initialsFromEmail(item.email)}</span>
                            <span className="invitation-user-email">{item.email}</span>
                          </div>
                        </td>
                        <td>
                          <span className="invitation-role-pill">
                            {formatInvitationRole(item.role)}
                          </span>
                        </td>
                        <td>
                          <span className={`invitation-status-pill ${item.status}`}>
                            <i aria-hidden="true" />
                            {formatInvitationStatus(item.status)}
                          </span>
                        </td>
                        <td>{formatInvitationDate(item.created_at)}</td>
                        <td>
                          <button
                            className="invitation-delete-btn"
                            disabled={deletingId === item.id}
                            onClick={() => handleDeleteInvitation(item.id)}
                            type="button"
                          >
                            {deletingId === item.id ? "..." : "Удалить"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppWorkspaceShell>
  );
}

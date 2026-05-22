"use client";

import { FormEvent, useEffect, useState } from "react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";

type TaskItem = {
  item_index: number;
  sku: string;
  product_reference: string;
  create_status_ru?: string | null;
  availability_status_ru?: string | null;
  error_message?: string | null;
  payload: Record<string, unknown>;
  availability_payload: Record<string, unknown>;
};

type Task = {
  id: string;
  status: string;
  controller: "jv" | "xl";
  process_id?: string | null;
  process_state?: string | null;
  total_items: number;
  failed_items: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  finished_at?: string | null;
  items: TaskItem[];
};

type TaskListResponse = {
  success: boolean;
  items: Task[];
};

export default function TasksPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [message, setMessage] = useState<string>("Нажмите «Обновить», чтобы получить задачи.");
  const [loadingTasks, setLoadingTasks] = useState(false);

  async function loadTasks() {
    setLoadingTasks(true);
    setMessage("Загружаем задачи...");
    try {
      const params = new URLSearchParams();
      if (statusFilter.trim()) params.set("status", statusFilter.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const response = await fetch(`/api/products/tasks?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await readJsonResponse<TaskListResponse>(response);
      if (!response.ok) {
        setMessage(readApiErrorMessage(payload, "Не удалось получить задачи", response.status));
        return;
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setTasks(items);
      setMessage(`Загружено задач: ${items.length}.`);
    } catch (caughtError) {
      setMessage(
        caughtError instanceof Error ? `Ошибка: ${caughtError.message}` : "Ошибка загрузки",
      );
    } finally {
      setLoadingTasks(false);
    }
  }

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    void loadTasks();
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
      activeHref="/tasks"
      currentUser={currentUser}
      sectionLabel="Задачи"
      title="История задач создания"
      description="Задачи хранятся в БД. Показаны только ваши задачи."
    >
      <div className="creator-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}
        <p className={`helper-banner ${message.includes("Ошибка") ? "" : "info"}`}>{message}</p>

        <section className="creator-editor">
          <form className="creator-form" onSubmit={submitFilters}>
            <div className="manual-form-grid">
              <label>
                Статус
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">Все</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="DONE">DONE</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </label>
              <label>
                Дата от
                <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label>
                Дата до
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
            </div>
            <button className="primary-btn" type="submit" disabled={loadingTasks}>
              {loadingTasks ? "Обновляем..." : "Обновить"}
            </button>
          </form>
        </section>

        <section className="creator-editor">
          <h2>Список задач</h2>
          {tasks.length === 0 ? (
            <p>Задач пока нет.</p>
          ) : (
            <div className="manual-creator-cards">
              {tasks.map((task) => (
                <article className="manual-product-card" key={task.id}>
                  <div className="manual-product-card-head">
                    <h3>Задача {task.id}</h3>
                    <span className="sync-pill">{task.status}</span>
                  </div>
                  <p>
                    Controller: <strong>{task.controller}</strong> | Items: <strong>{task.total_items}</strong> |
                    Failed: <strong>{task.failed_items}</strong> | Process: <strong>{task.process_state ?? "-"}</strong>
                  </p>
                  <p>Создано: {new Date(task.created_at).toLocaleString()}</p>
                  {task.error_message ? <p className="helper-banner">{task.error_message}</p> : null}

                  <div className="manual-images-list">
                    {task.items.map((item) => (
                      <div className="manual-image-item" key={`${task.id}-${item.item_index}-${item.sku}`}>
                        <div className="manual-image-item-meta">
                          <span>
                            #{item.item_index + 1} | SKU: {item.sku} | Ref: {item.product_reference}
                          </span>
                          <span>Создание: {item.create_status_ru ?? "-"}</span>
                          <span>Availability: {item.availability_status_ru ?? "-"}</span>
                          {item.error_message ? <span>Ошибка: {item.error_message}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppWorkspaceShell>
  );
}


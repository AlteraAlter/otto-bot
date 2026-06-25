"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import { useCurrentUser } from "../hooks/use-current-user";
import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { PageLoadingShell } from "../ui/page-loading-shell";

type TaskStatus = "queued" | "running" | "completed" | "failed";

type ProductImportTask = {
  id: string;
  file_name: string;
  status: TaskStatus;
  total_rows: number | null;
  processed_rows: number;
  upserted_rows: number;
  skipped_rows: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type TaskListResponse = {
  success: boolean;
  items: ProductImportTask[];
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function taskTone(status: TaskStatus) {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "info";
}

function taskLabel(status: TaskStatus) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  return "Failed";
}

function formatTaskError(errorMessage: string) {
  const compact = errorMessage.replace(/\s+/g, " ").trim();
  if (compact.length <= 220) return compact;
  return `${compact.slice(0, 219).trimEnd()}...`;
}

function taskProgress(task: ProductImportTask) {
  if (task.total_rows && task.total_rows > 0) {
    return Math.max(0, Math.min(100, Math.round((task.processed_rows / task.total_rows) * 100)));
  }
  return task.status === "completed" ? 100 : 0;
}

export default function ProductImportsPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [file, setFile] = useState<File | null>(null);
  const [tasks, setTasks] = useState<ProductImportTask[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success" | "info">("info");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isSeoUser = currentUser?.role === "SEO";
  const activeTask = useMemo(
    () => tasks.find((task) => task.status === "queued" || task.status === "running") ?? null,
    [tasks],
  );
  const queuedCount = useMemo(
    () => tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    [tasks],
  );
  const completedCount = useMemo(
    () => tasks.filter((task) => task.status === "completed").length,
    [tasks],
  );
  const failedCount = useMemo(
    () => tasks.filter((task) => task.status === "failed").length,
    [tasks],
  );

  async function loadTasks(showRefreshing = false) {
    if (!isSeoUser) return;
    if (showRefreshing) setIsRefreshing(true);

    try {
      const response = await fetch("/api/products/import-tasks?limit=16", {
        cache: "no-store",
      });
      const parsed = await readJsonResponse<TaskListResponse>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(readApiErrorMessage(parsed, "Could not load XLSX imports", response.status));
        return;
      }

      setTasks(parsed?.items ?? []);
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(caughtError instanceof Error ? caughtError.message : "Could not load XLSX imports");
    } finally {
      if (showRefreshing) setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (!isSeoUser) return;
    void loadTasks();
  }, [isSeoUser]);

  useEffect(() => {
    if (!activeTask) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadTasks();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [activeTask]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (currentUser?.role !== "SEO") {
      setMessageTone("error");
      setMessage("SEO access is required to launch XLSX imports.");
      return;
    }
    if (!file) {
      setMessageTone("error");
      setMessage("Select an XLSX file first.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await fetch("/api/products/upload-xlsx-task", {
        method: "POST",
        body: formData,
      });
      const parsed = await readJsonResponse<ProductImportTask>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(readApiErrorMessage(parsed, "Could not start XLSX import", response.status));
        return;
      }

      setMessageTone("success");
      setMessage("Успешно загружено.");
      setFile(null);
      form.reset();
      await loadTasks();
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(caughtError instanceof Error ? caughtError.message : "Could not start XLSX import");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  if (isLoading) {
    return <PageLoadingShell contentMode="dashboard" />;
  }

  const accessMessage =
    error ?? (!isSeoUser ? "Only SEO users can launch and monitor XLSX imports." : null);

  return (
    <AppWorkspaceShell
      activeHref="/imports"
      currentUser={currentUser}
      description="Import OTTO XLSX exports into the local product database."
      sectionLabel="Импорт"
      title="XLSX импорт"
    >
      <div className="imports-page-stack">
        <section className="imports-summary-grid" aria-label="XLSX import overview">
          <article className="imports-summary-card">
            <span>Active</span>
            <strong>{queuedCount}</strong>
            <p>{activeTask ? "Auto-refresh enabled while import is running." : "No active imports right now."}</p>
          </article>
          <article className="imports-summary-card">
            <span>Completed</span>
            <strong>{completedCount}</strong>
            <p>Recently finished imports stay visible below.</p>
          </article>
          <article className="imports-summary-card">
            <span>Failed</span>
            <strong>{failedCount}</strong>
            <p>Failed imports include the error message in the history.</p>
          </article>
        </section>

        <section className="imports-ops-section">
          <div className="imports-section-head">
            <div>
              <p className="page-section-label">XLSX</p>
              <h2>Upload spreadsheet</h2>
              <p>Use an OTTO XLSX export to refresh the local catalog database.</p>
            </div>
          </div>

          <article className="imports-job-card">
            <div className="imports-job-head">
              <span className="imports-job-badge">XLSX</span>
              <h3>OTTO Spreadsheet Import</h3>
            </div>
            <p className="imports-job-copy">Imports selected OTTO spreadsheet columns into the local products table.</p>

            <form className="imports-upload-form" onSubmit={handleSubmit}>
              <label className="field imports-file-field">
                <span>Spreadsheet file</span>
                <div className="imports-file-picker">
                  <label className="secondary-btn imports-picker-button" htmlFor="imports-xlsx-file">
                    Choose file
                  </label>
                  <input
                    accept=".xlsx"
                    className="imports-file-input"
                    disabled={!isSeoUser || isSubmitting}
                    id="imports-xlsx-file"
                    onChange={handleFileChange}
                    type="file"
                  />
                  <div className="imports-file-name">
                    {file ? file.name : "No file selected"}
                  </div>
                </div>
              </label>

              {file ? (
                <div className="imports-file-meta">
                  <span>{file.name}</span>
                  <strong>{Math.round(file.size / 1024)} KB</strong>
                </div>
              ) : (
                <div className="imports-file-placeholder">
                  Choose an OTTO XLSX export to queue the import job.
                </div>
              )}

              <button
                className="primary-btn imports-job-action"
                disabled={!isSeoUser || isSubmitting || !file}
                type="submit"
              >
                {isSubmitting ? "Starting..." : "Start XLSX import"}
              </button>
            </form>
          </article>
        </section>

        {accessMessage ? <p className="helper-banner">{accessMessage}</p> : null}
        {message ? (
          <p
            className={`helper-banner ${
              messageTone === "success" ? "success" : messageTone === "info" ? "info" : ""
            }`}
          >
            {message}
          </p>
        ) : null}

        <section className="imports-ops-section">
          <div className="imports-section-head imports-section-head-actions">
            <div>
              <p className="page-section-label">History</p>
              <h2>XLSX import history</h2>
              <p>Track progress, saved rows, skipped rows, and errors.</p>
            </div>
            <button
              className="secondary-btn"
              disabled={!isSeoUser || isRefreshing}
              onClick={() => void loadTasks(true)}
              type="button"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="task-list imports-task-list">
            {tasks.length === 0 ? (
              <div className="empty-state imports-empty-state">
                No XLSX imports yet.
              </div>
            ) : (
              tasks.map((task) => {
                const progress = taskProgress(task);

                return (
                  <article className="task-card imports-task-card" key={task.id}>
                    <div className="task-card-head imports-task-head">
                      <div className="imports-task-main">
                        <div className="imports-task-title-row">
                          <span className="imports-task-kind">XLSX import</span>
                          <strong>{task.file_name}</strong>
                        </div>
                        <p>{task.id}</p>
                      </div>
                      <span className={`task-status ${taskTone(task.status)}`}>
                        {taskLabel(task.status)}
                      </span>
                    </div>

                    <div className="imports-progress-block" aria-label="Import progress">
                      <div className="imports-progress-copy">
                        <span>Progress</span>
                        <strong>{`${progress}%`}</strong>
                      </div>
                      <div className="imports-progress-track">
                        <div className="imports-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    <div className="task-stats imports-task-stats">
                      <span>{`Total: ${task.total_rows ?? "-"}`}</span>
                      <span>{`Processed: ${task.processed_rows}`}</span>
                      <span>{`Saved: ${task.upserted_rows}`}</span>
                      <span>{`Skipped: ${task.skipped_rows}`}</span>
                    </div>

                    <div className="task-meta imports-task-meta">
                      <p>{`Created: ${formatDateTime(task.created_at)}`}</p>
                      <p>{`Started: ${formatDateTime(task.started_at)}`}</p>
                      <p>{`Finished: ${formatDateTime(task.finished_at)}`}</p>
                    </div>

                    {task.error_message ? (
                      <p className="helper-banner imports-task-error" title={task.error_message}>
                        {formatTaskError(task.error_message)}
                      </p>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </AppWorkspaceShell>
  );
}

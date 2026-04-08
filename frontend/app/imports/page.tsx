"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import { useCurrentUser } from "../hooks/use-current-user";
import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";

type TaskStatus = "queued" | "running" | "completed" | "failed";
type JobType = "afterbuy" | "xlsx";

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
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type TaskListResponse = {
  success: boolean;
  items: ProductImportTask[];
};

type JobDefinition = {
  type: JobType;
  badge: string;
  title: string;
  description: string;
  details: string;
  actionLabel: string;
};

const JOB_DEFINITIONS: JobDefinition[] = [
  {
    type: "afterbuy",
    badge: "Afterbuy",
    title: "JV Lister Sync",
    description: "Fetches Afterbuy JV lister data and stores it in the local `jv_lister` table.",
    details: "Use this when you need a fresh marketplace feed from Afterbuy in the background.",
    actionLabel: "Run Afterbuy sync",
  },
  {
    type: "xlsx",
    badge: "XLSX",
    title: "OTTO Spreadsheet Import",
    description: "Imports an OTTO XLSX export into the local products table with progress tracking.",
    details: "Use this when the team uploads a new spreadsheet snapshot from OTTO.",
    actionLabel: "Start XLSX import",
  },
];

function formatDateTime(value: string | null) {
  if (!value) return "—";
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

function detectJobType(task: ProductImportTask): JobType {
  return task.file_name.toLowerCase().startsWith("afterbuy") ? "afterbuy" : "xlsx";
}

function taskTypeLabel(type: JobType) {
  return type === "afterbuy" ? "Afterbuy sync" : "XLSX import";
}

function showIndeterminateProgress(task: ProductImportTask) {
  return detectJobType(task) === "afterbuy" && task.status !== "completed" && task.status !== "failed";
}

function formatTaskError(errorMessage: string) {
  const compact = errorMessage.replace(/\s+/g, " ").trim();
  if (compact.length <= 220) return compact;
  return `${compact.slice(0, 219).trimEnd()}…`;
}

export default function ProductImportsPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [file, setFile] = useState<File | null>(null);
  const [tasks, setTasks] = useState<ProductImportTask[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success" | "info">("info");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFetchingAfterbuy, setIsFetchingAfterbuy] = useState(false);
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
        setMessage(
          readApiErrorMessage(parsed, "Could not load background jobs", response.status),
        );
        return;
      }

      setTasks(parsed?.items ?? []);
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(
        caughtError instanceof Error ? caughtError.message : "Could not load background jobs",
      );
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
    if (currentUser?.role !== "SEO") {
      setMessageTone("error");
      setMessage("SEO access is required to launch imports.");
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
      setMessage("XLSX import queued successfully. Track the job below.");
      setFile(null);
      await loadTasks();
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(caughtError instanceof Error ? caughtError.message : "Could not start XLSX import");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAfterbuyFetch() {
    if (currentUser?.role !== "SEO") {
      setMessageTone("error");
      setMessage("SEO access is required to launch Afterbuy sync.");
      return;
    }

    setIsFetchingAfterbuy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/products/fetch-afterbuy-task", {
        method: "POST",
      });
      const parsed = await readJsonResponse<ProductImportTask>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(
          readApiErrorMessage(parsed, "Could not start Afterbuy sync", response.status),
        );
        return;
      }

      setMessageTone("success");
      setMessage("Afterbuy sync queued successfully. Track the job below.");
      await loadTasks();
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(
        caughtError instanceof Error ? caughtError.message : "Could not start Afterbuy sync",
      );
    } finally {
      setIsFetchingAfterbuy(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
  }

  if (isLoading) {
    return (
      <main className="otto-page">
        <section className="app-shell">
          <section className="workspace">
            <p className="helper-banner info">Please wait...</p>
          </section>
        </section>
      </main>
    );
  }

  const accessMessage =
    error ?? (!isSeoUser ? "Only SEO users can launch and monitor background jobs." : null);

  return (
    <AppWorkspaceShell
      activeHref="/imports"
      currentUser={currentUser}
      description="Launch XLSX imports and Afterbuy sync jobs in the background, then monitor progress from one full-page operational view."
      sectionLabel="Operations"
      title="Data Operations"
    >
      <div className="imports-page-stack">
        <section className="imports-summary-grid" aria-label="Operations overview">
          <article className="imports-summary-card">
            <span>Active jobs</span>
            <strong>{queuedCount}</strong>
            <p>{activeTask ? "Auto-refresh enabled while jobs are running." : "No active jobs right now."}</p>
          </article>
          <article className="imports-summary-card">
            <span>Completed</span>
            <strong>{completedCount}</strong>
            <p>Recently finished jobs stay visible in the history below.</p>
          </article>
          <article className="imports-summary-card">
            <span>Failed</span>
            <strong>{failedCount}</strong>
            <p>Review failed jobs directly in the history feed and retry from the same page.</p>
          </article>
        </section>

        <section className="imports-ops-section">
          <div className="imports-section-head">
            <div>
              <p className="page-section-label">Background Jobs</p>
              <h2>Available operations</h2>
              <p>Launch the jobs the team actually needs without leaving the page.</p>
            </div>
          </div>

          <div className="imports-job-grid">
            {JOB_DEFINITIONS.map((job) => (
              <article className="imports-job-card" key={job.type}>
                <div className="imports-job-head">
                  <span className="imports-job-badge">{job.badge}</span>
                  <h3>{job.title}</h3>
                </div>
                <p className="imports-job-copy">{job.description}</p>
                <p className="imports-job-detail">{job.details}</p>

                {job.type === "afterbuy" ? (
                  <button
                    className="primary-btn imports-job-action"
                    disabled={!isSeoUser || isFetchingAfterbuy}
                    onClick={() => void handleAfterbuyFetch()}
                    type="button"
                  >
                    {isFetchingAfterbuy ? "Starting..." : job.actionLabel}
                  </button>
                ) : (
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
                      disabled={!isSeoUser || isSubmitting || !file || isFetchingAfterbuy}
                      type="submit"
                    >
                      {isSubmitting ? "Starting..." : job.actionLabel}
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
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
              <p className="page-section-label">Job History</p>
              <h2>All needed background jobs</h2>
              <p>Each queued job stays visible here with progress, timing, and result details.</p>
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
                No background jobs yet. Start an import or sync above.
              </div>
            ) : (
              tasks.map((task) => {
                const jobType = detectJobType(task);

                return (
                  <article className="task-card imports-task-card" key={task.id}>
                    <div className="task-card-head imports-task-head">
                      <div className="imports-task-main">
                        <div className="imports-task-title-row">
                          <span className="imports-task-kind">{taskTypeLabel(jobType)}</span>
                          <strong>{task.file_name}</strong>
                        </div>
                        <p>{task.id}</p>
                      </div>
                      <span className={`task-status ${taskTone(task.status)}`}>
                        {taskLabel(task.status)}
                      </span>
                    </div>

                    {showIndeterminateProgress(task) ? (
                      <div className="imports-spinner-block" aria-label="Job progress">
                        <div className="imports-spinner" />
                        <div className="imports-spinner-copy">
                          <span>Progress</span>
                          <strong>Sync in progress</strong>
                          <p>
                            Remaining pages are unknown until Afterbuy returns an empty page.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="imports-progress-block" aria-label="Job progress">
                        <div className="imports-progress-copy">
                          <span>Progress</span>
                          <strong>
                            {task.total_rows && task.total_rows > 0
                              ? `${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    Math.round((task.processed_rows / task.total_rows) * 100),
                                  ),
                                )}%`
                              : task.status === "completed"
                                ? "100%"
                                : "0%"}
                          </strong>
                        </div>
                        <div className="imports-progress-track">
                          <div
                            className="imports-progress-fill"
                            style={{
                              width: `${
                                task.total_rows && task.total_rows > 0
                                  ? Math.max(
                                      0,
                                      Math.min(
                                        100,
                                        Math.round((task.processed_rows / task.total_rows) * 100),
                                      ),
                                    )
                                  : task.status === "completed"
                                    ? 100
                                    : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="task-stats imports-task-stats">
                      <span>{`Total: ${task.total_rows ?? "—"}`}</span>
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

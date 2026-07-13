"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Play,
  RefreshCcw,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { useCurrentUser } from "../hooks/use-current-user";
import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { PageLoadingShell } from "../ui/page-loading-shell";

type CompletedProduct = {
  id?: number;
  sku?: string | null;
  ean?: string | null;
  productReference?: string | null;
  productCategory?: string | null;
  marketplaceStatus?: string | null;
  activeStatus?: string | null;
  status?: string;
  reason?: string;
  attributesAdded?: number;
  attributeNames?: string[];
};

type AttributeFillTask = {
  success?: boolean;
  process_id?: string;
  process_state?: string;
  status?: string;
  current_step?: string;
  current_action?: string;
  fetch_meta?: Record<string, number | null | undefined>;
  fetch_progress?: Record<
    string,
    {
      page?: number | null;
      page_items?: number | null;
      fetched?: number | null;
      total?: number | null;
    }
  >;
  progress_total?: number;
  progress_completed?: number;
  progress_percent?: number;
  selected_products?: number;
  processed_products?: number;
  updated_products?: number;
  skipped_products?: number;
  failed_products?: number;
  generated_attributes?: number;
  chunks_total?: number;
  chunks_queued?: number;
  chunks_started?: number;
  chunks_completed?: number;
  chunks_failed?: number;
  status_checked_products?: number;
  active_products_count?: number;
  inactive_products_count?: number;
  missing_status_products_count?: number;
  status_feed?: Array<{
    sku?: string | null;
    ean?: string | null;
    activeStatus?: unknown;
    marketplaceStatus?: unknown;
    isActive?: boolean;
  }>;
  ai_feed?: Array<{
    sku?: string | null;
    stage?: string;
    category?: string | null;
    categoryGroup?: string | null;
    missingAttributes?: number;
    existingAttributes?: number;
    generatedAttributes?: number;
    acceptedAttributes?: number;
    attributeNames?: string[];
    at?: string;
  }>;
  last_completed_product?: CompletedProduct;
  completed_products?: CompletedProduct[];
  issues?: Array<{ sku?: string | null; ean?: string | null; message?: string }>;
  updated_at?: string;
  finished_at?: string;
};

function taskStatus(task: AttributeFillTask | null) {
  return String(task?.status || task?.process_state || "IDLE");
}

function isTaskRunning(task: AttributeFillTask | null) {
  return taskStatus(task) === "IN_PROGRESS";
}

function pct(task: AttributeFillTask | null) {
  return Math.max(0, Math.min(100, Math.round(Number(task?.progress_percent ?? 0))));
}

function formatNumber(value: unknown) {
  return Number(value ?? 0).toLocaleString("ru-RU");
}

function formatDate(value?: string | null) {
  if (!value) return "нет данных";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function statusLabel(status: string) {
  if (status === "IN_PROGRESS") return "В процессе";
  if (status === "DONE") return "Готово";
  if (status === "FAILED") return "Есть ошибки";
  return "Ожидание";
}

function productStatusLabel(status?: string) {
  if (status === "failed") return "Ошибка";
  if (status === "skipped") return "Пропущен";
  return "Готов";
}

function stepLabel(step?: string) {
  if (step === "attribute_fill_queued") return "В очереди";
  if (step === "attribute_fill_fetching_otto") return "Загрузка из OTTO XL";
  if (step === "attribute_fill_chunks_queued") return "Чанки поставлены в очередь";
  if (step === "attribute_fill_chunks_running") return "Worker-ы заполняют атрибуты";
  if (step === "attribute_fill_in_progress") return "AI заполняет missing attributes";
  if (step === "attribute_fill_done") return "Завершено";
  if (step === "attribute_fill_done_with_errors") return "Завершено с ошибками";
  return step || "Нет активного процесса";
}

export default function AttributeFillPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [task, setTask] = useState<AttributeFillTask | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const status = taskStatus(task);
  const running = isTaskRunning(task);
  const progress = pct(task);
  const completedProducts = useMemo(
    () => [...(task?.completed_products ?? [])].reverse().slice(0, 12),
    [task?.completed_products],
  );
  const fetchProgressItems = useMemo(
    () => Object.entries(task?.fetch_progress ?? {}),
    [task?.fetch_progress],
  );
  const recentIssues = useMemo(() => [...(task?.issues ?? [])].slice(-5).reverse(), [task?.issues]);
  const statusFeed = useMemo(() => [...(task?.status_feed ?? [])].reverse().slice(0, 12), [task?.status_feed]);
  const aiFeed = useMemo(() => [...(task?.ai_feed ?? [])].reverse().slice(0, 12), [task?.ai_feed]);

  async function loadTask(processId?: string, quiet = false) {
    if (!quiet) setIsRefreshing(true);
    try {
      const response = await fetch(
        processId
          ? `/api/products/attribute-fill/${encodeURIComponent(processId)}`
          : "/api/products/attribute-fill",
        { cache: "no-store" },
      );
      const payload = await readJsonResponse<AttributeFillTask>(response);
      if (!response.ok) {
        if (response.status !== 404) {
          throw new Error(readApiErrorMessage(payload, "Не удалось загрузить задачу", response.status));
        }
        return;
      }
      setTask(payload);
      setMessage(null);
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(caughtError instanceof Error ? caughtError.message : "Ошибка загрузки задачи");
    } finally {
      if (!quiet) setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/products/attribute-fill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await readJsonResponse<AttributeFillTask>(response);
      if (!response.ok) {
        throw new Error(readApiErrorMessage(payload, "Не удалось запустить задачу", response.status));
      }
      setTask(payload);
      setMessageTone("success");
      setMessage("Задача запущена.");
    } catch (caughtError) {
      setMessageTone("error");
      setMessage(caughtError instanceof Error ? caughtError.message : "Ошибка запуска задачи");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void loadTask(undefined, true);
  }, []);

  useEffect(() => {
    if (!task?.process_id || !running) return;
    const timer = window.setInterval(() => {
      void loadTask(task.process_id, true);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [running, task?.process_id]);

  if (isLoading) {
    return <PageLoadingShell contentMode="form" />;
  }

  const isSeoUser = currentUser?.role === "SEO";
  const accessMessage =
    error ?? (!isSeoUser ? "Только SEO-пользователь может запускать AI заполнение атрибутов." : null);
  const lastProduct = task?.last_completed_product;

  return (
    <AppWorkspaceShell
      activeHref="/attribute-fill"
      currentUser={currentUser}
      sectionLabel="AI"
      title="Заполнение атрибутов"
      description="Товары с активными маркетплейс-статусами, без пересчёта категории."
    >
      <div className="attribute-fill-workspace">
        <section className="attribute-fill-hero">
          <div className="attribute-fill-hero-copy">
            <span className="attribute-fill-kicker">
              <Sparkles size={16} strokeWidth={2.2} />
              Attribute AI
            </span>
            <h2>Заполнить только недостающие атрибуты</h2>
            <p>
              Берём товары батчами напрямую из OTTO XL, оставляем только активные по двум статусам и сохраняем только missing attributes.
            </p>
          </div>
          <div className="attribute-fill-hero-metrics">
            <div>
              <span>Выбрано</span>
              <strong>{formatNumber(task?.selected_products)}</strong>
            </div>
            <div>
              <span>Добавлено</span>
              <strong>{formatNumber(task?.generated_attributes)}</strong>
            </div>
          </div>
        </section>

        <div className="attribute-fill-layout">
          <aside className="attribute-fill-panel attribute-fill-controls">
            <div className="attribute-fill-panel-head">
              <div>
                <span>Запуск</span>
                <h3>OTTO XL batch</h3>
              </div>
            </div>

            <form className="attribute-fill-form" onSubmit={handleSubmit}>
              <div className="attribute-fill-run-note">
                <strong>Без ручных фильтров</strong>
                <span>Список товаров, active-status и marketplace-status берутся из OTTO XL. В работу попадают только товары с активными значениями в обоих статусах.</span>
              </div>

              {accessMessage ? <p className="helper-banner">{accessMessage}</p> : null}
              {message ? (
                <p className={`helper-banner ${messageTone === "success" ? "success" : ""}`}>
                  {message}
                </p>
              ) : null}

              <div className="attribute-fill-actions">
                <Button className="attribute-fill-primary-action" disabled={!isSeoUser || isSubmitting || running} type="submit">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span>{running ? "Задача выполняется" : "Запустить"}</span>
                </Button>
                <Button
                  disabled={isRefreshing}
                  onClick={() => void loadTask(task?.process_id)}
                  type="button"
                  variant="secondary"
                >
                  <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  <span>Обновить</span>
                </Button>
              </div>
            </form>
          </aside>

          <section className="attribute-fill-main">
            <div className="attribute-fill-panel">
              <div className="attribute-fill-progress-head">
                <div>
                  <span>Прогресс задачи</span>
                  <h3>{statusLabel(status)}</h3>
                </div>
                <span className={`attribute-fill-status is-${status.toLowerCase()}`}>
                  {status === "FAILED" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                  {statusLabel(status)}
                </span>
              </div>

              <div className="attribute-fill-progress">
                <div className="attribute-fill-live">
                  <span>Сейчас</span>
                  <strong>{stepLabel(task?.current_step)}</strong>
                  <small>{task?.current_action || "ожидает запуска"}</small>
                </div>

                <div className="fabric-progress-copy">
                  <span>
                  {formatNumber(task?.progress_completed)} из {formatNumber(task?.progress_total)} товаров
                  </span>
                  <b>{progress}%</b>
                </div>
                <div className="fabric-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>

              {fetchProgressItems.length ? (
                <div className="attribute-fill-fetch-grid">
                  {fetchProgressItems.map(([label, progressItem]) => (
                    <div className="attribute-fill-fetch-item" key={label}>
                      <span>{label}</span>
                      <strong>
                        {formatNumber(progressItem.fetched)} / {progressItem.total ? formatNumber(progressItem.total) : "?"}
                      </strong>
                      <small>page {formatNumber(progressItem.page)}</small>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="attribute-fill-stats">
                {[
                  ["Выбрано", task?.selected_products],
                  ["Обработано", task?.processed_products],
                  ["Обновлено", task?.updated_products],
                  ["Пропущено", task?.skipped_products],
                  ["Ошибок", task?.failed_products],
                  ["Атрибутов", task?.generated_attributes],
                  ["Статусов", task?.status_checked_products],
                  ["Не активны", task?.inactive_products_count],
                  ["Чанков", task?.chunks_total],
                  ["Чанков готово", task?.chunks_completed],
                  ["Чанков ошибок", task?.chunks_failed],
                ].map(([label, value]) => (
                  <div key={label} className="attribute-fill-stat">
                    <span>{label}</span>
                    <strong>{formatNumber(value)}</strong>
                  </div>
                ))}
              </div>

              {recentIssues.length ? (
                <div className="attribute-fill-issues">
                  <span>Последние ошибки</span>
                  {recentIssues.map((issue, index) => (
                    <p key={`${issue.sku ?? "issue"}-${index}`}>
                      <strong>{issue.sku || issue.ean || "без SKU"}</strong>
                      {issue.message || "Ошибка без сообщения"}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="attribute-fill-last">
                <span>Последний завершённый</span>
                <div>
                  <strong>
                    {lastProduct?.sku || lastProduct?.ean || "нет данных"}
                  </strong>
                  <small>
                    {lastProduct
                      ? `${productStatusLabel(lastProduct.status)}, атрибутов: ${formatNumber(lastProduct.attributesAdded)}`
                      : "ожидает первого товара"}
                  </small>
                </div>
              </div>
            </div>

            <div className="attribute-fill-panel">
              <div className="attribute-fill-table-head">
                <div>
                  <span>Status feed</span>
                  <h3>Проверка активных статусов</h3>
                </div>
                <span className="attribute-fill-mini-stat">
                  active {formatNumber(task?.active_products_count)} / checked {formatNumber(task?.status_checked_products)}
                </span>
              </div>

              {statusFeed.length ? (
                <div className="attribute-fill-feed-list">
                  {statusFeed.map((item, index) => (
                    <div className="attribute-fill-feed-row" key={`${item.sku ?? item.ean ?? index}-${index}`}>
                      <div>
                        <strong>{item.sku || item.ean || "без SKU"}</strong>
                        <span>
                          active-status: {String(item.activeStatus ?? "-")} · marketplace: {String(item.marketplaceStatus ?? "-")}
                        </span>
                      </div>
                      <b className={item.isActive ? "is-active" : "is-inactive"}>
                        {item.isActive ? "active" : "not active"}
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="attribute-fill-empty">Статусы ещё не проверялись.</div>
              )}
            </div>

            <div className="attribute-fill-panel">
              <div className="attribute-fill-table-head">
                <div>
                  <span>AI feed</span>
                  <h3>Что сейчас у ИИ</h3>
                </div>
              </div>

              {aiFeed.length ? (
                <div className="attribute-fill-feed-list">
                  {aiFeed.map((item, index) => (
                    <div className="attribute-fill-feed-row" key={`${item.sku ?? "ai"}-${item.stage ?? index}-${index}`}>
                      <div>
                        <strong>{item.sku || "без SKU"}</strong>
                        <span>
                          {item.stage === "ai_start"
                            ? `старт: missing ${formatNumber(item.missingAttributes)}, existing ${formatNumber(item.existingAttributes)}`
                            : `готово: accepted ${formatNumber(item.acceptedAttributes)}, generated ${formatNumber(item.generatedAttributes)}`}
                        </span>
                        {item.attributeNames?.length ? <small>{item.attributeNames.slice(0, 6).join(", ")}</small> : null}
                      </div>
                      <b className={item.stage === "ai_start" ? "is-ai" : "is-active"}>
                        {item.stage === "ai_start" ? "AI" : "done"}
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="attribute-fill-empty">ИИ ещё не получил товар.</div>
              )}
            </div>

            <div className="attribute-fill-panel">
              <div className="attribute-fill-table-head">
                <div>
                  <span>Журнал</span>
                  <h3>Последние товары</h3>
                </div>
                <time>{formatDate(task?.updated_at)}</time>
              </div>

              {completedProducts.length ? (
                <div className="attribute-fill-product-list">
                  {completedProducts.map((item, index) => (
                    <div
                      className="attribute-fill-product-row"
                      key={`${item.sku ?? item.ean ?? item.id ?? index}-${index}`}
                    >
                      <div className="attribute-fill-product-copy">
                        <strong>
                          {item.sku || item.ean || "без SKU"}
                        </strong>
                        <span>
                          {item.productCategory || "категория не указана"}
                        </span>
                        {item.attributeNames?.length ? (
                          <small>
                            {item.attributeNames.slice(0, 5).join(", ")}
                          </small>
                        ) : null}
                      </div>
                      <div className="attribute-fill-product-meta">
                        <span className="attribute-fill-added">
                          +{formatNumber(item.attributesAdded)}
                        </span>
                        <span
                          className={`attribute-fill-row-status is-${item.status ?? "done"}`}
                        >
                          {productStatusLabel(item.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="attribute-fill-empty">
                  Нет завершённых товаров.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppWorkspaceShell>
  );
}

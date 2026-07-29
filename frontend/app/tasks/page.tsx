"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, PowerOff, RotateCcw, XCircle } from "lucide-react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { PageLoadingShell } from "../ui/page-loading-shell";

type DeactivateItemResult = {
  ean: string;
  sku: string;
  quantity_success: boolean;
  status_success: boolean;
  success: boolean;
  message: string;
};

type DeactivateResponse = {
  success?: boolean;
  controller?: "jv" | "xl";
  total?: number;
  failed?: number;
  items?: DeactivateItemResult[];
  message?: string;
};

function parseEans(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,|;/)
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean),
    ),
  );
}

export default function TasksPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [controller, setController] = useState<"jv" | "xl">("jv");
  const [deactivateInput, setDeactivateInput] = useState<string>("");
  const [message, setMessage] = useState<string>("Вставьте EAN, чтобы деактивировать найденные товары в OTTO.");
  const [results, setResults] = useState<DeactivateItemResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eans = useMemo(() => parseEans(deactivateInput), [deactivateInput]);
  const failedCount = results.filter((item) => !item.success).length;
  const successCount = results.length - failedCount;
  const isErrorMessage =
    message.startsWith("Ошибка") ||
    message.startsWith("Не удалось") ||
    message.startsWith("Добавьте") ||
    message.startsWith("Готово с ошибками");
  const statusTone =
    isErrorMessage ? "error" : results.length > 0 && failedCount === 0 ? "success" : "processing";

  async function submitDeactivate() {
    if (eans.length === 0) {
      setMessage("Добавьте хотя бы один EAN.");
      return;
    }

    setIsSubmitting(true);
    setMessage(`Деактивирую товаров: ${eans.length}...`);
    setResults([]);
    try {
      const response = await fetch("/api/products/deactivate-by-ean", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controller, eans }),
        cache: "no-store",
      });
      const payload = await readJsonResponse<DeactivateResponse>(response);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const failed = Number(
        payload?.failed ?? items.filter((item) => !item.success).length,
      );
      setResults(items);
      if (!response.ok || payload?.success === false) {
        const apiMessage = readApiErrorMessage(
          payload,
          "Не удалось деактивировать товары",
          response.status,
        );
        setMessage(
          items.length > 0
            ? `Готово с ошибками: ${failed} из ${items.length} не обработано.`
            : apiMessage,
        );
        return;
      }
      setMessage(
        failed > 0
          ? `Готово с ошибками: ${failed} из ${items.length} не обработано.`
          : `Готово. Деактивировано товаров: ${items.length}.`,
      );
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? `Ошибка: ${caughtError.message}` : "Запрос на деактивацию не выполнен.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearForm() {
    setDeactivateInput("");
    setResults([]);
    setMessage("Вставьте EAN, чтобы деактивировать найденные товары в OTTO.");
  }

  if (isLoading) {
    return <PageLoadingShell contentMode="form" />;
  }

  return (
    <AppWorkspaceShell
      activeHref="/tasks"
      currentUser={currentUser}
      sectionLabel="Удаление"
      title="Удаление товаров"
      description="Деактивация товаров по EAN без истории задач."
      hidePageHead
    >
      <div className="delete-page">
        <header className="page-header">
          <div>
            <span className="page-header__eyebrow">Удаление</span>
            <h1>Удаление товаров</h1>
            <p>Деактивация товаров по EAN без истории задач.</p>
          </div>
        </header>

        {error ? <p className="helper-banner">{error}</p> : null}

        <div className="delete-page__content">
          <section className="delete-card">
            <header className="delete-card__header">
              <div>
                <span className="delete-card__marketplace">OTTO</span>
                <h2>Удалить по EAN</h2>
              </div>
              <span className="delete-card__count">
                {`${eans.length} EAN${eans.length === 1 ? "" : "s"}`}
              </span>
            </header>

            <div className="delete-form-grid">
              <label className="form-field">
                <span className="form-field__label">Контроллер</span>
                <select
                  className="controller-select"
                  value={controller}
                  onChange={(event) => setController(event.target.value as "jv" | "xl")}
                  disabled={isSubmitting}
                >
                  <option value="jv">JV</option>
                  <option value="xl">XL</option>
                </select>
              </label>

              <label className="form-field">
                <span className="form-field__label">Список EAN</span>
                <textarea
                  className="ean-textarea"
                  rows={4}
                  value={deactivateInput}
                  onChange={(event) => setDeactivateInput(event.target.value)}
                  placeholder={`3212215141\n13214514\n4069424980745`}
                  disabled={isSubmitting}
                />
              </label>
            </div>

            <div className="delete-status" data-status={statusTone}>
              {isErrorMessage ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
              <span>{message}</span>
            </div>

            <div className="delete-card__actions">
              <button
                className="delete-button delete-button--secondary"
                type="button"
                onClick={clearForm}
                disabled={isSubmitting || (!deactivateInput && results.length === 0)}
              >
                <RotateCcw size={16} />
                Очистить
              </button>
              <button
                className="delete-button delete-button--danger"
                type="button"
                onClick={() => void submitDeactivate()}
                disabled={isSubmitting || eans.length === 0}
              >
                {isSubmitting ? <Loader2 className="spin" size={16} /> : <PowerOff size={16} />}
                {isSubmitting ? "Удаляю" : "Удалить товары"}
              </button>
            </div>
          </section>

        {results.length > 0 ? (
          <section className="delete-results">
            <header className="delete-results__header">
              <div>
                <h2>Результат</h2>
                <p>{`Успешно: ${successCount}, с ошибкой: ${failedCount}`}</p>
              </div>
              <span
                className={`delete-badge ${failedCount > 0 ? "delete-badge--error" : "delete-badge--success"}`}
              >
                {failedCount > 0 ? "Проверить" : "Готово"}
              </span>
            </header>

            <div className="delete-results__list">
              {results.map((item) => (
                <article
                  className="result-row"
                  data-status={item.success ? "success" : "error"}
                  key={`${item.ean}-${item.sku}`}
                >
                  <div className="result-row__icon" aria-hidden="true">
                    {item.success ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  </div>
                  <div className="result-row__identity">
                    <strong>{item.ean}</strong>
                    <span>{item.sku || "SKU не найден"}</span>
                  </div>
                  <div className="result-row__badges">
                    <span
                      className={`delete-badge ${item.quantity_success ? "delete-badge--success" : "delete-badge--error"}`}
                    >
                      Количество 0
                    </span>
                    <span
                      className={`delete-badge ${item.status_success ? "delete-badge--success" : "delete-badge--error"}`}
                    >
                      Неактивен
                    </span>
                  </div>
                  <p className="result-row__message">{item.message}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        </div>
      </div>
    </AppWorkspaceShell>
  );
}

"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, PowerOff, RotateCcw, XCircle } from "lucide-react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";
import { PageLoadingShell } from "../ui/page-loading-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
  const [message, setMessage] = useState<string>("Paste EAN values and deactivate the matching OTTO products.");
  const [results, setResults] = useState<DeactivateItemResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eans = useMemo(() => parseEans(deactivateInput), [deactivateInput]);
  const failedCount = results.filter((item) => !item.success).length;
  const successCount = results.length - failedCount;

  async function submitDeactivate() {
    if (eans.length === 0) {
      setMessage("Add at least one EAN.");
      return;
    }

    setIsSubmitting(true);
    setMessage(`Deactivating ${eans.length} product${eans.length === 1 ? "" : "s"}...`);
    setResults([]);
    try {
      const response = await fetch("/api/products/deactivate-by-ean", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controller, eans }),
        cache: "no-store",
      });
      const payload = await readJsonResponse<DeactivateResponse>(response);
      if (!response.ok || payload?.success === false) {
        setMessage(readApiErrorMessage(payload, "Could not deactivate products", response.status));
        return;
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const failed = Number(payload?.failed ?? 0);
      setResults(items);
      setMessage(
        failed > 0
          ? `Finished with errors: ${failed} of ${items.length} failed.`
          : `Done. Deactivated ${items.length} product${items.length === 1 ? "" : "s"}.`,
      );
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? `Error: ${caughtError.message}` : "Deactivate request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearForm() {
    setDeactivateInput("");
    setResults([]);
    setMessage("Paste EAN values and deactivate the matching OTTO products.");
  }

  if (isLoading) {
    return <PageLoadingShell contentMode="form" />;
  }

  return (
    <AppWorkspaceShell
      activeHref="/tasks"
      currentUser={currentUser}
      sectionLabel="Задачи"
      title="Деактивация товаров"
      description="Batch deactivation by EAN without saving task history."
    >
      <div className="deactivate-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}

        <Card className="deactivate-panel">
          <div className="deactivate-panel-head">
            <div>
              <span className="deactivate-kicker">OTTO status tool</span>
              <h2>Deactivate by EAN</h2>
            </div>
            <Badge variant={eans.length > 0 ? "secondary" : "outline"}>
              {`${eans.length} EAN${eans.length === 1 ? "" : "s"}`}
            </Badge>
          </div>

          <div className="deactivate-grid">
            <label className="deactivate-field">
              Controller
              <select value={controller} onChange={(event) => setController(event.target.value as "jv" | "xl")} disabled={isSubmitting}>
                <option value="jv">JV</option>
                <option value="xl">XL</option>
              </select>
            </label>

            <label className="deactivate-field deactivate-eans">
              EAN list
              <textarea
                rows={12}
                value={deactivateInput}
                onChange={(event) => setDeactivateInput(event.target.value)}
                placeholder={`3212215141\n13214514\n4069424980745`}
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div className={`deactivate-message ${message.startsWith("Error") || message.startsWith("Could") || message.startsWith("Add") ? "is-error" : ""}`}>
            {message.startsWith("Error") || message.startsWith("Could") || message.startsWith("Add") ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
            <span>{message}</span>
          </div>

          <div className="deactivate-actions">
            <Button type="button" variant="secondary" onClick={clearForm} disabled={isSubmitting || (!deactivateInput && results.length === 0)}>
              <RotateCcw size={16} />
              Clear
            </Button>
            <Button type="button" onClick={() => void submitDeactivate()} disabled={isSubmitting || eans.length === 0}>
              {isSubmitting ? <Loader2 className="spin" size={16} /> : <PowerOff size={16} />}
              {isSubmitting ? "Deactivating" : "Deactivate Products"}
            </Button>
          </div>
        </Card>

        {results.length > 0 ? (
          <Card className="deactivate-results">
            <div className="deactivate-results-head">
              <div>
                <h2>Result</h2>
                <p>{`${successCount} succeeded, ${failedCount} failed`}</p>
              </div>
              <Badge variant={failedCount > 0 ? "outline" : "success"}>
                {failedCount > 0 ? "Needs review" : "Complete"}
              </Badge>
            </div>

            <div className="deactivate-result-list">
              {results.map((item) => (
                <article className={`deactivate-result-row ${item.success ? "is-success" : "is-failed"}`} key={`${item.ean}-${item.sku}`}>
                  <div className="deactivate-result-icon" aria-hidden="true">
                    {item.success ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  </div>
                  <div>
                    <strong>{item.ean}</strong>
                    <span>{item.sku || "SKU not found"}</span>
                  </div>
                  <div className="deactivate-result-checks">
                    <Badge variant={item.quantity_success ? "secondary" : "outline"}>Quantity 0</Badge>
                    <Badge variant={item.status_success ? "secondary" : "outline"}>Inactive</Badge>
                  </div>
                  <p>{item.message}</p>
                </article>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}

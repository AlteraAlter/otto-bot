"use client";

import { useEffect, useMemo, useState } from "react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";

type UploadState = "idle" | "loading" | "success" | "error";
type ControllerOption = "jv" | "xl";
const CREATOR_DRAFT_KEY = "creator_process_draft_v1";

type FabricOption = { id: string; name: string; items_count?: number };
type FabricListResponse = { factory?: FabricOption[] };
type CreateFromFabricResponse = {
  success?: boolean;
  process_id?: string | null;
  process_state?: string | null;
  issues?: string[];
};
type PrepareStatusResponse = {
  success?: boolean;
  process_id?: string;
  process_state?: string;
  source_items?: number;
  mapped_items?: number;
  payload_items?: number;
  issues?: string[];
  products?: Record<string, unknown>[];
  current_step?: string;
  step_elapsed_sec?: number;
  heartbeat_lag_sec?: number;
  stuck?: boolean;
  stuck_message?: string | null;
};
type SubmitPreparedResponse = {
  success?: boolean;
  saved_path?: string;
  products_count?: number;
  otto_process_id?: string | null;
  otto_create_state?: string;
  otto_update_result?: Record<string, unknown>;
  otto_failed_result?: Record<string, unknown> | null;
};
type OttoSummary = {
  state: string;
  total: number;
  progress: number;
  succeeded: number;
  failed: number;
};
type OttoErrorRow = {
  variation: string;
  code: string;
  title: string;
  jsonPath: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function updateProductField(product: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const next = { ...product };
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    cursor[key] = asRecord(cursor[key]);
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

function firstImage(product: Record<string, unknown>): string {
  const assets = product.mediaAssets;
  if (!Array.isArray(assets) || assets.length === 0) return "";
  return String(asRecord(assets[0]).location ?? asRecord(assets[0]).filename ?? "");
}

export default function CreatorPage() {
  const { currentUser, isLoading, error } = useCurrentUser();
  const [controller, setController] = useState<ControllerOption>("jv");
  const [fabrics, setFabrics] = useState<FabricOption[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string>("");
  const [state, setState] = useState<UploadState>("idle");
  const [isLoadingFabrics, setIsLoadingFabrics] = useState(false);
  const [message, setMessage] = useState("Выберите fabric и нажмите «Выставить».");
  const [issues, setIssues] = useState<string[]>([]);
  const [processId, setProcessId] = useState<string>("");
  const [processState, setProcessState] = useState<string>("IDLE");
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>("prepare_initializing");
  const [stepElapsed, setStepElapsed] = useState<number>(0);
  const [heartbeatLag, setHeartbeatLag] = useState<number>(0);
  const [stuckMessage, setStuckMessage] = useState<string>("");
  const [hydratedDraft, setHydratedDraft] = useState(false);
  const [ottoProcessId, setOttoProcessId] = useState<string>("");
  const [ottoSummary, setOttoSummary] = useState<OttoSummary | null>(null);
  const [ottoErrors, setOttoErrors] = useState<OttoErrorRow[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CREATOR_DRAFT_KEY);
      if (!raw) {
        setHydratedDraft(true);
        return;
      }
      const draft = JSON.parse(raw) as Record<string, unknown>;
      setController((draft.controller as ControllerOption) ?? "jv");
      setSelectedFabricId(String(draft.selectedFabricId ?? ""));
      setState((draft.state as UploadState) ?? "idle");
      setMessage(String(draft.message ?? "Выберите fabric и нажмите «Выставить»."));
      setIssues(Array.isArray(draft.issues) ? (draft.issues as string[]) : []);
      setProcessId(String(draft.processId ?? ""));
      setProcessState(String(draft.processState ?? "IDLE"));
      setProducts(Array.isArray(draft.products) ? (draft.products as Record<string, unknown>[]) : []);
      setSelectedIndex(Number(draft.selectedIndex ?? 0));
      setCurrentStep(String(draft.currentStep ?? "prepare_initializing"));
      setStepElapsed(Number(draft.stepElapsed ?? 0));
      setHeartbeatLag(Number(draft.heartbeatLag ?? 0));
      setStuckMessage(String(draft.stuckMessage ?? ""));
      setOttoProcessId(String(draft.ottoProcessId ?? ""));
      const summary = asRecord(draft.ottoSummary);
      if (Object.keys(summary).length > 0) {
        setOttoSummary({
          state: String(summary.state ?? ""),
          total: Number(summary.total ?? 0),
          progress: Number(summary.progress ?? 0),
          succeeded: Number(summary.succeeded ?? 0),
          failed: Number(summary.failed ?? 0),
        });
      }
      setOttoErrors(Array.isArray(draft.ottoErrors) ? (draft.ottoErrors as OttoErrorRow[]) : []);
    } catch {
      // ignore broken draft and continue with clean state
    } finally {
      setHydratedDraft(true);
    }
  }, []);

  useEffect(() => {
    if (!hydratedDraft) return;
    const draft = {
      controller,
      selectedFabricId,
      state,
      message,
      issues,
      processId,
      processState,
      products,
      selectedIndex,
      currentStep,
      stepElapsed,
      heartbeatLag,
      stuckMessage,
      ottoProcessId,
      ottoSummary,
      ottoErrors,
    };
    window.localStorage.setItem(CREATOR_DRAFT_KEY, JSON.stringify(draft));
  }, [
    hydratedDraft,
    controller,
    selectedFabricId,
    state,
    message,
    issues,
    processId,
    processState,
    products,
    selectedIndex,
    currentStep,
    stepElapsed,
    heartbeatLag,
    stuckMessage,
    ottoProcessId,
    ottoSummary,
    ottoErrors,
  ]);

  useEffect(() => {
    let active = true;
    async function loadFabrics() {
      setIsLoadingFabrics(true);
      try {
        const response = await fetch(`/api/products/fabrics?controller=${encodeURIComponent(controller)}`, { method: "GET", cache: "no-store" });
        const parsed = await readJsonResponse<FabricListResponse>(response);
        if (!active) return;
        if (!response.ok) {
          setFabrics([]);
          setSelectedFabricId("");
          setMessage(readApiErrorMessage(parsed, "Не удалось загрузить fabrics", response.status));
          return;
        }
        const items = Array.isArray(parsed?.factory) ? parsed.factory : [];
        setFabrics(items);
        setSelectedFabricId(items[0]?.id ?? "");
      } catch {
        if (!active) return;
        setFabrics([]);
        setSelectedFabricId("");
        setMessage("Ошибка загрузки списка fabrics.");
      } finally {
        if (active) setIsLoadingFabrics(false);
      }
    }
    void loadFabrics();
    return () => { active = false; };
  }, [controller]);

  useEffect(() => {
    if (!processId || processState !== "IN_PROGRESS") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/products/create-from-fabric/${processId}`, { method: "GET", cache: "no-store" });
      const parsed = await readJsonResponse<PrepareStatusResponse>(response);
      if (!response.ok || parsed?.success === false) return;
      const nextState = parsed?.process_state ?? "IN_PROGRESS";
      setProcessState(nextState);
      setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
      setCurrentStep(String(parsed?.current_step ?? "in_progress"));
      setStepElapsed(Number(parsed?.step_elapsed_sec ?? 0));
      setHeartbeatLag(Number(parsed?.heartbeat_lag_sec ?? 0));
      setStuckMessage(parsed?.stuck ? String(parsed?.stuck_message ?? "Процесс завис") : "");
      if (nextState === "DONE") {
        const rows = Array.isArray(parsed?.products) ? parsed.products : [];
        setProducts(rows);
        setSelectedIndex(0);
        setState("success");
        setMessage(`Подготовка завершена: source=${parsed?.source_items ?? 0}, mapped=${parsed?.mapped_items ?? 0}, payload=${parsed?.payload_items ?? rows.length}.`);
      }
      if (nextState === "FAILED") {
        setState("error");
        setMessage("Подготовка завершилась с ошибкой.");
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [processId, processState]);

  const rows = useMemo(() => products.map((product, index) => {
    const description = asRecord(product.productDescription);
    const pricing = asRecord(product.pricing);
    const standardPrice = asRecord(pricing.standardPrice);
    return {
      index,
      image: firstImage(product),
      sku: String(product.sku ?? ""),
      category: String(description.category ?? ""),
      price: String(standardPrice.amount ?? ""),
      productLine: String(description.productLine ?? ""),
    };
  }), [products]);

  const selectedProduct = asRecord(products[selectedIndex]);
  const selectedDescription = asRecord(selectedProduct.productDescription);
  const selectedPricing = asRecord(selectedProduct.pricing);
  const selectedStandardPrice = asRecord(selectedPricing.standardPrice);
  const selectedImage = firstImage(selectedProduct);
  const selectedBulletPoints = Array.isArray(selectedDescription.bulletPoints)
    ? selectedDescription.bulletPoints.map((item) => String(item))
    : [];
  const selectedAttributes = Array.isArray(selectedDescription.attributes)
    ? selectedDescription.attributes
    : [];

  function updateSelected(path: string[], value: string) {
    setProducts((prev) => {
      const next = [...prev];
      next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), path, value);
      return next;
    });
  }

  async function handleCreate() {
    if (!selectedFabricId) {
      setState("error");
      setMessage("Сначала выберите fabric.");
      return;
    }
    setState("loading");
    setProcessState("IN_PROGRESS");
    setMessage("Процесс подготовки запущен...");
    setIssues([]);
    setProducts([]);
    setProcessId("");
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
    try {
      const response = await fetch("/api/products/create-from-fabric", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ controller, factory_id: selectedFabricId }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<CreateFromFabricResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
        setMessage(readApiErrorMessage(parsed, "Не удалось запустить подготовку", response.status));
        return;
      }
      setProcessId(parsed?.process_id ?? "");
      setMessage(`Запуск успешен. Process ID: ${parsed?.process_id ?? "-"}`);
    } catch (caughtError) {
      setState("error");
      setMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  async function submitEditedProducts() {
    if (!processId || products.length === 0) return;
    setState("loading");
    setMessage("Загрузить: отправляю все продукты в OTTO...");
    try {
      const response = await fetch(`/api/products/create-from-fabric/${processId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ products }),
        cache: "no-store",
      });
      const parsed = await readJsonResponse<SubmitPreparedResponse>(response);
      if (!response.ok || parsed?.success === false) {
        setState("error");
        setMessage(readApiErrorMessage(parsed, "Не удалось сохранить итоговые данные", response.status));
        return;
      }
      const update = asRecord(parsed?.otto_update_result);
      const failed = asRecord(parsed?.otto_failed_result);
      const failedCount = Number(update.failed ?? 0);
      const ottoPid = String(parsed?.otto_process_id ?? "");
      setOttoProcessId(ottoPid);
      setOttoSummary({
        state: String(update.state ?? parsed?.otto_create_state ?? ""),
        total: Number(update.total ?? 0),
        progress: Number(update.progress ?? 0),
        succeeded: Number(update.succeeded ?? 0),
        failed: Number(update.failed ?? 0),
      });

      const resultErrors = Array.isArray(failed.results) ? failed.results : [];
      const nextErrors: OttoErrorRow[] = resultErrors.flatMap((entry) => {
        const rec = asRecord(entry);
        const variation = String(rec.variation ?? "unknown");
        const errs = Array.isArray(rec.errors) ? rec.errors : [];
        return errs.map((err) => {
          const errRec = asRecord(err);
          return {
            variation,
            code: String(errRec.code ?? "error"),
            title: String(errRec.title ?? "Unknown error"),
            jsonPath: String(errRec.jsonPath ?? ""),
          };
        });
      });
      setOttoErrors(nextErrors);

      if (failedCount > 0) {
        setState("error");
        const nextIssues: string[] = nextErrors.map((item) => `${item.variation}: ${item.code}`);
        setIssues(nextIssues.length > 0 ? nextIssues : [`OTTO process ${ottoPid}: failed=${failedCount}`]);
        setMessage(`Загрузить: OTTO process completed with errors. PID=${ottoPid}`);
        return;
      }

      setState("success");
      setMessage(`Загрузить: OTTO accepted ${parsed?.products_count ?? products.length} products. PID=${ottoPid}. File: ${parsed?.saved_path ?? "-"}`);
      setIssues([]);
    } catch (caughtError) {
      setState("error");
      setMessage(caughtError instanceof Error ? `Ошибка запроса: ${caughtError.message}` : "Ошибка запроса");
    }
  }

  function handleClear() {
    window.localStorage.removeItem(CREATOR_DRAFT_KEY);
    setState("idle");
    setMessage("Состояние очищено.");
    setIssues([]);
    setProcessId("");
    setProcessState("IDLE");
    setProducts([]);
    setSelectedIndex(0);
    setCurrentStep("prepare_initializing");
    setStepElapsed(0);
    setHeartbeatLag(0);
    setStuckMessage("");
    setOttoProcessId("");
    setOttoSummary(null);
    setOttoErrors([]);
  }

  if (isLoading) {
    return <main className="otto-page"><section className="app-shell"><section className="workspace"><p className="helper-banner info">Пожалуйста, подождите...</p></section></section></main>;
  }

  return (
    <AppWorkspaceShell
      activeHref="/creator"
      currentUser={currentUser}
      sectionLabel="Создание"
      title="Подготовка по Fabric"
      description=""
    >
      <div className="creator-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}
        <section className="creator-editor">
          <div className="creator-editor-head"><h2>Подготовка</h2></div>
          <div className="creator-mode-switch">
            <label>Controller
              <select value={controller} onChange={(event) => setController(event.target.value as ControllerOption)} disabled={state === "loading"}>
                <option value="jv">jv</option><option value="xl">xl</option>
              </select>
            </label>
            <label>Fabric
              <select value={selectedFabricId} onChange={(event) => setSelectedFabricId(event.target.value)} disabled={isLoadingFabrics || state === "loading" || fabrics.length === 0}>
                {fabrics.length === 0 ? <option value="">{isLoadingFabrics ? "Загрузка fabrics..." : "Нет fabrics"}</option> : fabrics.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.id} ({item.items_count ?? 0})</option>)}
              </select>
            </label>
            <button className="primary-btn" type="button" onClick={handleCreate} disabled={state === "loading" || !selectedFabricId}>
              {state === "loading" ? "Запуск..." : "Выставить"}
            </button>
          </div>
          <p className={`helper-banner ${state === "error" ? "error" : "info"}`}>{message}</p>
          {processId ? <p className="helper-banner info">Process ID: {processId} / State: {processState}</p> : null}
          {ottoProcessId ? <p className="helper-banner info">OTTO Process ID: {ottoProcessId}</p> : null}
          {ottoSummary ? (
            <div className="otto-summary-grid">
              <div><span>State</span><strong>{ottoSummary.state || "-"}</strong></div>
              <div><span>Total</span><strong>{ottoSummary.total}</strong></div>
              <div><span>Progress</span><strong>{ottoSummary.progress}</strong></div>
              <div><span>Succeeded</span><strong>{ottoSummary.succeeded}</strong></div>
              <div><span>Failed</span><strong>{ottoSummary.failed}</strong></div>
            </div>
          ) : null}
          {processId ? (
            <div className="creator-runtime-panel">
              <div className="creator-runtime-row">
                <span>Шаг</span>
                <strong>{currentStep}</strong>
              </div>
              <div className="creator-runtime-row">
                <span>Время шага</span>
                <strong>{Math.max(0, Math.round(stepElapsed))}s</strong>
              </div>
              <div className="creator-runtime-row">
                <span>Heartbeat lag</span>
                <strong>{Math.max(0, Math.round(heartbeatLag))}s</strong>
              </div>
              {stuckMessage ? <p className="helper-banner error">{stuckMessage}</p> : null}
            </div>
          ) : null}
          {issues.length > 0 ? <ul className="issues-list">{issues.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : null}
          {ottoErrors.length > 0 ? (
            <div className="otto-errors-table-wrap">
              <table className="otto-errors-table">
                <thead>
                  <tr><th>Variation</th><th>Code</th><th>Title</th><th>jsonPath</th></tr>
                </thead>
                <tbody>
                  {ottoErrors.map((row, index) => (
                    <tr key={`${index}-${row.code}-${row.variation}`}>
                      <td>{row.variation}</td>
                      <td>{row.code}</td>
                      <td>{row.title}</td>
                      <td>{row.jsonPath || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {rows.length > 0 ? (
          <section className="saas-products-layout">
            <div className="saas-products-table-wrap">
              <table className="saas-products-table">
                <thead><tr><th>Preview</th><th>SKU</th><th>Category</th><th>Price</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.index}
                      className={selectedIndex === row.index ? "is-selected" : ""}
                      onClick={() => setSelectedIndex(row.index)}
                    >
                      <td>{row.image ? <img className="saas-product-thumb" src={row.image} alt={row.sku || `product-${row.index}`} /> : <div className="saas-product-thumb saas-product-thumb-empty">No image</div>}</td>
                      <td>{row.sku || "-"}</td>
                      <td>{row.category || "-"}</td>
                      <td>{row.price || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="saas-editor-panel">
              <h3>Редактор товара</h3>
              <p>Польза для юзера: быстро проверить фото, SKU и category перед отправкой, без JSON-хаоса.</p>
              <div className="saas-editor-image-wrap">
                {selectedImage ? <img className="saas-editor-image" src={selectedImage} alt={String(selectedProduct.sku ?? "preview")} /> : <div className="saas-editor-image saas-editor-image-empty">No image</div>}
              </div>
              <div className="saas-editor-grid">
                <label>SKU<input value={String(selectedProduct.sku ?? "")} onChange={(event) => updateSelected(["sku"], event.target.value)} /></label>
                <label>EAN<input value={String(selectedProduct.ean ?? "")} onChange={(event) => updateSelected(["ean"], event.target.value)} /></label>
                <label>Product Reference<input value={String(selectedProduct.productReference ?? "")} onChange={(event) => updateSelected(["productReference"], event.target.value)} /></label>
                <label>Category<input value={String(selectedDescription.category ?? "")} onChange={(event) => updateSelected(["productDescription", "category"], event.target.value)} /></label>
                <label>Price
                  <input
                    value={String(selectedStandardPrice.amount ?? "")}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      const amount = value === "" ? 0 : Number(value);
                      if (Number.isNaN(amount)) return;
                      setProducts((prev) => {
                        const next = [...prev];
                        next[selectedIndex] = updateProductField(asRecord(next[selectedIndex]), ["pricing", "standardPrice", "amount"], amount);
                        return next;
                      });
                    }}
                  />
                </label>
                <label>Product Line<input value={String(selectedDescription.productLine ?? "")} onChange={(event) => updateSelected(["productDescription", "productLine"], event.target.value)} /></label>
                <label>Bullet Points (one per line)
                  <textarea
                    value={selectedBulletPoints.join("\n")}
                    onChange={(event) => {
                      const next = event.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean);
                      setProducts((prev) => {
                        const copy = [...prev];
                        copy[selectedIndex] = updateProductField(
                          asRecord(copy[selectedIndex]),
                          ["productDescription", "bulletPoints"],
                          next,
                        );
                        return copy;
                      });
                    }}
                    rows={6}
                  />
                </label>
                <label>Attributes (JSON array)
                  <textarea
                    value={JSON.stringify(selectedAttributes, null, 2)}
                    onChange={(event) => {
                      try {
                        const parsed = JSON.parse(event.target.value);
                        if (!Array.isArray(parsed)) return;
                        setProducts((prev) => {
                          const copy = [...prev];
                          copy[selectedIndex] = updateProductField(
                            asRecord(copy[selectedIndex]),
                            ["productDescription", "attributes"],
                            parsed,
                          );
                          return copy;
                        });
                      } catch {
                        // let user type invalid JSON temporarily without crashing
                      }
                    }}
                    rows={10}
                  />
                </label>
                <label>Description
                  <textarea value={String(selectedDescription.description ?? "")} onChange={(event) => updateSelected(["productDescription", "description"], event.target.value)} rows={7} />
                </label>
              </div>
              <button className="primary-btn" type="button" onClick={submitEditedProducts}>Загрузить</button>
              <button className="secondary-btn" type="button" onClick={handleClear}>Clear</button>
            </aside>
          </section>
        ) : null}
      </div>
    </AppWorkspaceShell>
  );
}

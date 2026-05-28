"use client";

import { useEffect, useState } from "react";

import { readApiErrorMessage, readJsonResponse } from "../lib/api";
import { useCurrentUser } from "../hooks/use-current-user";
import { AppWorkspaceShell } from "../ui/app-workspace-shell";

type UploadState = "idle" | "loading" | "success" | "error";
type ControllerOption = "jv" | "xl";

type FabricOption = {
  id: string;
  name: string;
  items_count?: number;
};

type FabricListResponse = {
  factory?: FabricOption[];
};

type CreateFromFabricResponse = {
  success?: boolean;
  source_items?: number;
  mapped_items?: number;
  payload_items?: number;
  process_id?: string | null;
  process_state?: string | null;
  issues?: string[];
};

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

  useEffect(() => {
    let active = true;

    async function loadFabrics() {
      setIsLoadingFabrics(true);
      try {
        const response = await fetch(
          `/api/products/fabrics?controller=${encodeURIComponent(controller)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
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
        if (active) {
          setIsLoadingFabrics(false);
        }
      }
    }

    void loadFabrics();

    return () => {
      active = false;
    };
  }, [controller]);

  async function handleCreate() {
    if (!selectedFabricId) {
      setState("error");
      setMessage("Сначала выберите fabric.");
      return;
    }

    setState("loading");
    setMessage("Запускаю выставление в OTTO...");
    setIssues([]);
    setProcessId("");

    try {
      const response = await fetch("/api/products/create-from-fabric", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          controller,
          factory_id: selectedFabricId,
        }),
        cache: "no-store",
      });

      const parsed = await readJsonResponse<CreateFromFabricResponse>(response);

      if (!response.ok || parsed?.success === false) {
        setState("error");
        setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
        setMessage(readApiErrorMessage(parsed, "Не удалось запустить выставление", response.status));
        return;
      }

      setState("success");
      setProcessId(parsed?.process_id ?? "");
      setIssues(Array.isArray(parsed?.issues) ? parsed.issues : []);
      setMessage(
        `Готово: source=${parsed?.source_items ?? 0}, mapped=${parsed?.mapped_items ?? 0}, payload=${parsed?.payload_items ?? 0}, state=${parsed?.process_state ?? "-"}.`,
      );
    } catch (caughtError) {
      setState("error");
      setMessage(
        caughtError instanceof Error
          ? `Ошибка запроса: ${caughtError.message}`
          : "Ошибка запроса",
      );
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
      activeHref="/creator"
      currentUser={currentUser}
      sectionLabel="Создание"
      title="Выставление по Fabric"
      description="Выберите fabric, запустите mapper-процесс и отправку полного payload в OTTO."
    >
      <div className="creator-workspace">
        {error ? <p className="helper-banner">{error}</p> : null}

        <section className="creator-editor">
          <div className="creator-editor-head">
            <h2>Новый сценарий создания</h2>
          </div>

          <div className="creator-mode-switch">
            <label>
              Controller
              <select
                value={controller}
                onChange={(event) => setController(event.target.value as ControllerOption)}
                disabled={state === "loading"}
              >
                <option value="jv">jv</option>
                <option value="xl">xl</option>
              </select>
            </label>

            <label>
              Fabric
              <select
                value={selectedFabricId}
                onChange={(event) => setSelectedFabricId(event.target.value)}
                disabled={isLoadingFabrics || state === "loading" || fabrics.length === 0}
              >
                {fabrics.length === 0 ? (
                  <option value="">
                    {isLoadingFabrics ? "Загрузка fabrics..." : "Нет fabrics"}
                  </option>
                ) : (
                  fabrics.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name ?? item.id} ({item.items_count ?? 0})
                    </option>
                  ))
                )}
              </select>
            </label>

            <button
              className="primary-btn"
              type="button"
              onClick={handleCreate}
              disabled={state === "loading" || !selectedFabricId}
            >
              {state === "loading" ? "Запуск..." : "Выставить"}
            </button>
          </div>

          <p className={`helper-banner ${state === "error" ? "error" : "info"}`}>{message}</p>

          {processId ? <p className="helper-banner info">Process ID: {processId}</p> : null}

          {issues.length > 0 ? (
            <ul className="issues-list">
              {issues.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </AppWorkspaceShell>
  );
}

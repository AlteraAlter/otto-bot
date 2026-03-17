"use client";

import { FormEvent, useState } from "react";

type UploadState = "idle" | "loading" | "success" | "error";

export default function UploaderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState<string>("Select a JSON file and upload it.");
  const [responseBody, setResponseBody] = useState<string>("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setState("error");
      setMessage("Please choose a file first.");
      return
    }

    setState("loading");
    setMessage("Uploading...");
    setResponseBody("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/uploader", {
        method: "POST",
        body: formData
      });

      const text = await response.text();
      const pretty = (() => {
        try {
          return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          return text;
        }
      })();

      if (!response.ok) {
        setState("error");
        setMessage(`Upload failed (${response.status}).`);
        setResponseBody(pretty);
        return;
      }

      setState("success");
      setMessage("Upload successful.");
      setResponseBody(pretty);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setState("error");
      setMessage(`Upload failed: ${detail}`);
    }
  }

  return (
    <main className="uploader-page">
      <section className="uploader-card">
        <h1>Upload JSON File</h1>
        <p>Endpoint: POST /v1/uploader/send-file</p>

        <form onSubmit={handleSubmit} className="uploader-form">
          <label htmlFor="upload-file">Choose file</label>
          <input
            id="upload-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />

          <button type="submit" disabled={state === "loading"}>
            {state === "loading" ? "Uploading..." : "Upload"}
          </button>
        </form>

        <p className={`uploader-message ${state}`}>{message}</p>

        {responseBody ? (
          <pre className="uploader-response">{responseBody}</pre>
        ) : null}
      </section>
    </main>
  );
}

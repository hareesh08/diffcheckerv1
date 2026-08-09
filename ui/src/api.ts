export type UploadedFileMeta = {
  id: string;
  path: string;
  name: string;
  size: number;
};

export type JobOptionsInput = {
  mode: string;
  originalSheet: string;
  changedSheet: string;
  headerRow?: number;
  rowKeyColumn?: string;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  hideUnchangedRows?: boolean;
  hideUnchangedColumns?: boolean;
  preserveFormatting?: boolean;
};

export type Change = {
  rowNumber: number;
  column: number;
  ref: string;
  old: string;
  new: string;
  type: string;
};

export type ResultRow = {
  rowNumber: number;
  status: string;
  changes: Change[];
  originalValues?: string[];
  changedValues?: string[];
};

export type JobStatus = {
  id: string;
  status: "queued" | "parsing" | "comparing" | "completed" | "failed" | "cancelled";
  error?: string;
  progress?: number;
  progressLabel?: string;
  summary?: {
    matchedRows?: number;
    modifiedRows?: number;
    addedRows?: number;
    deletedRows?: number;
    modifiedCells?: number;
  };
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  originalName?: string;
  changedName?: string;
};

export type RowsResponse = {
  filter: string;
  page: number;
  pageSize: number;
  totalRows: number;
  rows: ResultRow[];
};

type JobRow = {
  filter?: string;
  page?: number;
  pageSize?: number;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function uploadFile(file: File): Promise<UploadedFileMeta> {
  const form = new FormData();
  form.append("file", file);
  return request<UploadedFileMeta>("/api/upload", { method: "POST", body: form });
}

export function getSheets(path: string): Promise<{ sheets: string[] }> {
  return request<{ sheets: string[] }>("/api/sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export function createJob(body: {
  originalPath: string;
  changedPath: string;
  options: JobOptionsInput;
}): Promise<{ jobId: string }> {
  return request<{ jobId: string }>("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}/status`);
}

export async function getJobRows(jobId: string, params: JobRow = {}): Promise<RowsResponse> {
  const q = new URLSearchParams();
  if (params.filter) q.set("filter", params.filter);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const query = q.toString();
  const response = await request<RowsResponse>(
    `/api/jobs/${encodeURIComponent(jobId)}/rows${query ? `?${query}` : ""}`,
  );
  return {
    ...response,
    rows: (response.rows ?? []).map((row) => ({
      ...row,
      changes: row.changes ?? [],
    })),
  };
}

export function cancelJob(jobId: string): Promise<void> {
  return fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }).then(() => {});
}

export async function exportResults(
  jobId: string,
  filter: string,
  format: "csv" | "jsonl",
): Promise<Blob> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filter, format }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.blob();
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function shutdownServer(): Promise<{ status: string }> {
  return request<{ status: string }>("/api/shutdown", { method: "POST" });
}

export function restartServer(): Promise<{ status: string }> {
  return request<{ status: string }>("/api/restart", { method: "POST" });
}

// â”€â”€ History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type HistoryJob = {
  id: string;
  name: string;
  mode: string;
  originalName: string;
  changedName: string;
  status: string;
  summary: string;
  meta: string;
  createdAt: string;
  completedAt: string;
};

export type ExportRecord = {
  id: number;
  jobId: string;
  name: string;
  format: string;
  filter: string;
  createdAt: string;
};

export function listHistory(): Promise<{ jobs: HistoryJob[] }> {
  return request<{ jobs: HistoryJob[] }>("/api/history");
}

export function renameHistoryJob(id: string, name: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/history/${encodeURIComponent(id)}/name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteHistoryJob(id: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function finalizeJob(id: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/jobs/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
  });
}

export function listExports(): Promise<{ exports: ExportRecord[] }> {
  return request<{ exports: ExportRecord[] }>("/api/exports");
}

export function deleteExport(id: number): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/exports/${id}`, { method: "DELETE" });
}

export async function exportResultsNamed(
  jobId: string,
  name: string,
  filter: string,
  format: "csv" | "jsonl" | "xlsx" | "pdf",
): Promise<Blob> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, filter, format }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.blob();
}

export function openReport(jobId: string, filter: string) {
  window.open(
    `/api/jobs/${encodeURIComponent(jobId)}/report?filter=${encodeURIComponent(filter)}`,
    "_blank",
  );
}

export async function getSettings(): Promise<{ logs: boolean }> {
  return request<{ logs: boolean }>("/api/settings");
}

export async function setSettingsLogs(enabled: boolean): Promise<{ logs: boolean }> {
  return request<{ logs: boolean }>("/api/settings/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

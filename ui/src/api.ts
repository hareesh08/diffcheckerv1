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
  column: string;
  ref: string;
  old: string;
  new: string;
  type: string;
};

export type ResultRow = {
  rowNumber: number;
  status: string;
  changes: Change[];
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
  sheetName: string;
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
  return request<RowsResponse>(
    `/api/jobs/${encodeURIComponent(jobId)}/rows${query ? `?${query}` : ""}`,
  );
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

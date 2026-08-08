export type CellStatus = "same" | "modified" | "added" | "deleted";

export type Cell = {
  value: string;
  prev?: string;
  status: CellStatus;
  numeric?: boolean;
};

export type DiffRow = {
  index: number;
  status: CellStatus;
  cells: Cell[];
};

export const COLUMNS = ["A", "B", "C", "D", "E"] as const;
export const HEADERS = ["SKU", "Product", "Price", "Category", "Location"] as const;

const cell = (value: string, extra: Partial<Cell> = {}): Cell => ({
  value,
  status: "same",
  ...extra,
});

export const DIFF_ROWS: DiffRow[] = [
  {
    index: 1,
    status: "same",
    cells: [
      cell("SKU-0982"),
      cell("Mechanical Keyboard"),
      cell("149.00", { numeric: true }),
      cell("Hardware"),
      cell("Warehouse-A"),
    ],
  },
  {
    index: 2,
    status: "modified",
    cells: [
      cell("SKU-0983"),
      cell("Wireless Mouse"),
      cell("89.00", { numeric: true, status: "modified", prev: "79.00" }),
      cell("Hardware"),
      cell("Warehouse-A"),
    ],
  },
  {
    index: 3,
    status: "same",
    cells: [
      cell("SKU-0984"),
      cell("USB-C Cable"),
      cell("19.00", { numeric: true }),
      cell("Accessories"),
      cell("Warehouse-B"),
    ],
  },
  {
    index: 4,
    status: "added",
    cells: [
      cell("SKU-1002", { status: "added" }),
      cell("Webcam 4K", { status: "added" }),
      cell("299.00", { numeric: true, status: "added" }),
      cell("Hardware", { status: "added" }),
      cell("Warehouse-C", { status: "added" }),
    ],
  },
  {
    index: 5,
    status: "deleted",
    cells: [
      cell("SKU-0821", { status: "deleted" }),
      cell("Monitor Stand", { status: "deleted" }),
      cell("45.00", { numeric: true, status: "deleted" }),
      cell("Office", { status: "deleted" }),
      cell("Warehouse-A", { status: "deleted" }),
    ],
  },
  {
    index: 6,
    status: "modified",
    cells: [
      cell("SKU-0985"),
      cell("Desk Mat"),
      cell("25.00", { numeric: true, status: "modified", prev: "22.50" }),
      cell("Accessories"),
      cell("Warehouse-B"),
    ],
  },
  {
    index: 7,
    status: "same",
    cells: [
      cell("SKU-0986"),
      cell("Laptop Sleeve 14\""),
      cell("39.00", { numeric: true }),
      cell("Accessories"),
      cell("Warehouse-C"),
    ],
  },
  {
    index: 8,
    status: "modified",
    cells: [
      cell("SKU-0987"),
      cell("Dock Station"),
      cell("219.00", { numeric: true }),
      cell("Hardware"),
      cell("Warehouse-C", { status: "modified", prev: "Warehouse-A" }),
    ],
  },
];

export type Change = {
  ref: string;
  row: number;
  kind: Exclude<CellStatus, "same">;
  detail: string;
  from?: string;
  to?: string;
};

export const CHANGES: Change[] = [
  { ref: "C2", row: 2, kind: "modified", detail: "Unit price adjusted.", from: "79.00", to: "89.00" },
  { ref: "R4", row: 4, kind: "added", detail: "New record inserted with SKU SKU-1002." },
  { ref: "R5", row: 5, kind: "deleted", detail: "SKU SKU-0821 removed from source." },
  { ref: "C6", row: 6, kind: "modified", detail: "Unit price adjusted.", from: "22.50", to: "25.00" },
  { ref: "E8", row: 8, kind: "modified", detail: "Stock location reassigned.", from: "Warehouse-A", to: "Warehouse-C" },
];

export const STATS = { modified: 32, added: 12, deleted: 4, rows: 1248, ms: 12 };

export const PREVIEW_ROWS = [
  ["SKU-0982", "Mechanical Keyboard", "149.00", "Hardware", "Warehouse-A"],
  ["SKU-0983", "Wireless Mouse", "79.00", "Hardware", "Warehouse-A"],
  ["SKU-0984", "USB-C Cable", "19.00", "Accessories", "Warehouse-B"],
  ["SKU-0985", "Desk Mat", "22.50", "Accessories", "Warehouse-B"],
];

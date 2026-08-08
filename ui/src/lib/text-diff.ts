export type TextDiffLine = {
  left?: string | undefined;
  right?: string | undefined;
  leftNo?: number | undefined;
  rightNo?: number | undefined;
  status: "same" | "modified" | "added" | "deleted";
};


/** Simple LCS-based line diff, enough for side-by-side text comparison. */
export function diffLines(a: string, b: string): TextDiffLine[] {
  const left = a.split("\n");
  const right = b.split("\n");
  const n = left.length;
  const m = right.length;

  const at = (arr: string[], i: number) => arr[i] ?? "";
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const score = (i: number, j: number) => lcs[i]?.[j] ?? 0;

  for (let i = n - 1; i >= 0; i--) {
    const row = lcs[i]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        at(left, i) === at(right, j)
          ? score(i + 1, j + 1) + 1
          : Math.max(score(i + 1, j), score(i, j + 1));
    }
  }

  const out: TextDiffLine[] = [];
  let i = 0;
  let j = 0;
  let ln = 1;
  let rn = 1;
  while (i < n && j < m) {
    if (at(left, i) === at(right, j)) {
      out.push({ left: at(left, i), right: at(right, j), leftNo: ln++, rightNo: rn++, status: "same" });
      i++;
      j++;
    } else if (score(i + 1, j) >= score(i, j + 1)) {
      out.push({ left: at(left, i), leftNo: ln++, status: "deleted" });
      i++;
    } else {
      out.push({ right: at(right, j), rightNo: rn++, status: "added" });
      j++;
    }
  }
  while (i < n) out.push({ left: at(left, i++), leftNo: ln++, status: "deleted" });
  while (j < m) out.push({ right: at(right, j++), rightNo: rn++, status: "added" });

  // Pair adjacent delete+add into a single modified row for readability.
  const paired: TextDiffLine[] = [];
  for (let k = 0; k < out.length; k++) {
    const cur = out[k]!;
    const next = out[k + 1];
    if (cur.status === "deleted" && next && next.status === "added") {
      paired.push({
        left: cur.left,
        right: next.right,
        leftNo: cur.leftNo,
        rightNo: next.rightNo,
        status: "modified",
      });
      k++;
    } else {
      paired.push(cur);
    }
  }
  return paired;
}

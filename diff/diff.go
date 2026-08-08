package diff

// Op represents a single edit operation.
type Op struct {
	Type string // "insert", "delete", or "equal"
	Text string
}

// Myers computes a shortest edit script between two line slices.
func Myers(a, b []string) []Op {
	n, m := len(a), len(b)
	max := n + m
	if max == 0 {
		return nil
	}
	v := make([]int, 2*max+1)
	var trace [][]int
	offset := max
	found := false
	D := -1
	for d := 0; d <= max && !found; d++ {
		trace = append(trace, append([]int(nil), v...))
		for k := -d; k <= d; k += 2 {
			var x int
			if k == -d || (k != d && v[offset+k-1] < v[offset+k+1]) {
				x = v[offset+k+1]
			} else {
				x = v[offset+k-1] + 1
			}
			y := x - k
			for x < n && y < m && a[x] == b[y] {
				x++
				y++
			}
			v[offset+k] = x
			if x >= n && y >= m {
				found = true
				D = d
				break
			}
		}
	}

	var ops []Op
	x, y := n, m
	for d := D; d >= 0; d-- {
		v := trace[d]
		k := x - y
		var prevK int
		if k == -d || (k != d && v[offset+k-1] < v[offset+k+1]) {
			prevK = k + 1
		} else {
			prevK = k - 1
		}
		prevX := v[offset+prevK]
		prevY := prevX - prevK

		for x > prevX && y > prevY {
			ops = append(ops, Op{Type: "equal", Text: a[x-1]})
			x--
			y--
		}
		if d > 0 {
			if x > prevX {
				ops = append(ops, Op{Type: "delete", Text: a[x-1]})
				x--
			} else if y > prevY {
				ops = append(ops, Op{Type: "insert", Text: b[y-1]})
				y--
			}
		}
	}
	reverse(ops)
	return ops
}

func reverse(ops []Op) {
	for i, j := 0, len(ops)-1; i < j; i, j = i+1, j-1 {
		ops[i], ops[j] = ops[j], ops[i]
	}
}

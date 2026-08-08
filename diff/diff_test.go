package diff

import "testing"

func TestMyersEqual(t *testing.T) {
	a := []string{"a", "b", "c"}
	ops := Myers(a, a)
	want := 3
	if len(ops) != want {
		t.Fatalf("got %d ops, want %d", len(ops), want)
	}
	for _, op := range ops {
		if op.Type != "equal" {
			t.Fatalf("got %q, want equal", op.Type)
		}
	}
}

func TestMyersInsert(t *testing.T) {
	a := []string{"a", "c"}
	b := []string{"a", "b", "c"}
	ops := Myers(a, b)
	var got []string
	for _, op := range ops {
		if op.Type == "insert" {
			got = append(got, op.Text)
		}
	}
	if len(got) != 1 || got[0] != "b" {
		t.Fatalf("got %v, want [b]", got)
	}
}

func TestMyersDelete(t *testing.T) {
	a := []string{"a", "b", "c"}
	b := []string{"a", "c"}
	ops := Myers(a, b)
	var got []string
	for _, op := range ops {
		if op.Type == "delete" {
			got = append(got, op.Text)
		}
	}
	if len(got) != 1 || got[0] != "b" {
		t.Fatalf("got %v, want [b]", got)
	}
}

func TestMyersReplace(t *testing.T) {
	a := []string{"a", "old", "c"}
	b := []string{"a", "new", "c"}
	ops := Myers(a, b)
	var pairs []string
	for _, op := range ops {
		pairs = append(pairs, op.Type)
	}
	// Expect: equal(a), delete(old), insert(new), equal(c)
	want := []string{"equal", "delete", "insert", "equal"}
	if len(pairs) != len(want) {
		t.Fatalf("got %v, want %v", pairs, want)
	}
	for i := range want {
		if pairs[i] != want[i] {
			t.Fatalf("got %v, want %v", pairs, want)
		}
	}
}

func TestMyersEmpty(t *testing.T) {
	if ops := Myers(nil, nil); len(ops) != 0 {
		t.Fatalf("empty diff should be nil, got %v", ops)
	}
	if ops := Myers([]string{"a"}, nil); len(ops) != 1 || ops[0].Type != "delete" {
		t.Fatalf("got %v", ops)
	}
}

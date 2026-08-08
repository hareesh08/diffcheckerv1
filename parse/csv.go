package parse

import (
	"encoding/csv"
	"io"
	"os"
	"strings"
)

// Delimiter returns the CSV delimiter for a file extension.
func Delimiter(ext string) rune {
	switch strings.ToLower(ext) {
	case ".tsv":
		return '\t'
	default:
		return ','
	}
}

// CSVReader streams records from a CSV/TSV/TXT file one row at a time.
type CSVReader struct {
	reader  *csv.Reader
	file    *os.File
	isFirst bool
}

// NewCSVReader opens a CSV file for streaming. It strips a UTF-8 BOM.
func NewCSVReader(path string, delim rune) (*CSVReader, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(f)
	r.Comma = delim
	r.LazyQuotes = true
	r.FieldsPerRecord = -1
	return &CSVReader{reader: r, file: f, isFirst: true}, nil
}

// Next reads the next record. Returns nil, io.EOF at end of file.
func (c *CSVReader) Next() ([]string, error) {
	rec, err := c.reader.Read()
	if err != nil {
		return nil, err
	}
	if c.isFirst {
		c.isFirst = false
		// Strip BOM from first cell.
		if len(rec) > 0 {
			rec[0] = strings.TrimPrefix(rec[0], "\uFEFF")
		}
	}
	return rec, nil
}

// Close closes the underlying file.
func (c *CSVReader) Close() error { return c.file.Close() }

// CountLines streams through a file counting records (used for progress).
func CountLines(path string, delim rune) (int64, error) {
	r, err := NewCSVReader(path, delim)
	if err != nil {
		return 0, err
	}
	defer r.Close()
	var n int64
	for {
		_, err := r.Next()
		if err == io.EOF {
			return n, nil
		}
		if err != nil {
			return n, err
		}
		n++
	}
}

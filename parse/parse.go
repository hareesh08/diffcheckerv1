package parse

import (
	"io"
	"strings"
)

// Reader streams rows one at a time. Callers must Close.
type Reader interface {
	// Next returns the next row, or (nil, io.EOF) at end.
	Next() ([]string, error)
	Close() error
}

// Open creates a streaming reader for a file based on its extension.
// Supported: csv, tsv, txt, xlsx, xlsm.
func Open(path string, sheetName string) (Reader, error) {
	ext := strings.ToLower(path[strings.LastIndex(path, ".")+1:])
	switch ext {
	case "csv", "tsv", "txt":
		reader, err := NewCSVReader(path, Delimiter("."+ext))
		if err != nil {
			return nil, err
		}
		return &csvAdapter{r: reader}, nil
	case "xlsx", "xlsm":
		return NewXLSXReader(path, sheetName)
	default:
		return nil, &UnsupportedFormatError{Ext: ext}
	}
}

type UnsupportedFormatError struct{ Ext string }

func (e *UnsupportedFormatError) Error() string {
	return "unsupported file format: " + e.Ext
}

// csvAdapter wraps CSVReader to satisfy Reader with io.EOF semantics.
type csvAdapter struct{ r *CSVReader }

func (c *csvAdapter) Next() ([]string, error) {
	rec, err := c.r.Next()
	if err == io.EOF {
		return nil, io.EOF
	}
	return rec, err
}

func (c *csvAdapter) Close() error { return c.r.Close() }

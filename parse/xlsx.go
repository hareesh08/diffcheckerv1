package parse

import (
	"fmt"
	"io"

	"github.com/xuri/excelize/v2"
)

// XLSXReader streams rows from an xlsx/xlsm sheet one row at a time.
type XLSXReader struct {
	file *excelize.File
	rows *excelize.Rows
}

// NewXLSXReader opens a workbook and prepares streaming of the given sheet.
// An empty sheetName selects the first sheet.
func NewXLSXReader(path, sheetName string) (*XLSXReader, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	if sheetName == "" {
		sheets := f.GetSheetList()
		if len(sheets) == 0 {
			f.Close()
			return nil, fmt.Errorf("no sheets found")
		}
		sheetName = sheets[0]
	}
	rows, err := f.Rows(sheetName)
	if err != nil {
		f.Close()
		return nil, err
	}
	return &XLSXReader{file: f, rows: rows}, nil
}

// Next reads the next row. Returns nil, io.EOF at end of sheet.
func (x *XLSXReader) Next() ([]string, error) {
	if !x.rows.Next() {
		if err := x.rows.Error(); err != nil {
			return nil, err
		}
		return nil, io.EOF
	}
	cols, err := x.rows.Columns()
	if err != nil {
		return nil, err
	}
	return cols, nil
}

// Close releases the workbook.
func (x *XLSXReader) Close() error {
	x.rows.Close()
	return x.file.Close()
}

// SheetNames lists worksheets in an xlsx/xlsm file.
func SheetNames(path string) ([]string, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return f.GetSheetList(), nil
}

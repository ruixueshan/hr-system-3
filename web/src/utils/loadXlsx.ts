let excelPromise: Promise<any> | null = null;

const MAX_EXCEL_FILE_SIZE = 2 * 1024 * 1024;
const MAX_EXCEL_ROWS = 2000;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type SheetData = {
  rows: Record<string, any>[];
  header?: string[];
  textColumns?: string[];
};

type WorkbookData = {
  sheets: Array<{ name: string; data: SheetData }>;
};

type WriteFileOptions = {
  bookType?: 'xls' | 'xlsx' | string;
};

async function loadExcelJS() {
  if (!excelPromise) {
    excelPromise = import('exceljs');
  }

  const mod = await excelPromise;
  return mod.default || mod;
}

function normalizeExportName(fileName: string) {
  return fileName.toLowerCase().endsWith('.xls')
    ? fileName.replace(/\.xls$/i, '.xlsx')
    : fileName;
}

function downloadBuffer(buffer: ArrayBuffer | BlobPart, fileName: string, mimeType: string) {
  const blob = new Blob([buffer], {
    type: mimeType
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadXlsxBuffer(buffer: ArrayBuffer, fileName: string) {
  downloadBuffer(
    buffer,
    normalizeExportName(fileName),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

function escapeHtml(value: any) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlWorksheet(sheet: { name: string; data: SheetData }) {
  const headers = collectHeaders(sheet.data.rows, sheet.data.header);
  const textColumns = new Set(sheet.data.textColumns || []);
  const headerRow = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const bodyRows = sheet.data.rows
    .map((row) => {
      const cells = headers.map((header) => {
        const style = textColumns.has(header) ? ' style="mso-number-format:&quot;\\@&quot;"' : '';
        return `<td${style}>${escapeHtml(row?.[header] ?? '')}</td>`;
      });
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');

  return [
    `<h3>${escapeHtml(sheet.name || 'Sheet1')}</h3>`,
    '<table border="1">',
    headerRow ? `<thead><tr>${headerRow}</tr></thead>` : '',
    `<tbody>${bodyRows}</tbody>`,
    '</table>'
  ].join('');
}

function writeHtmlXlsFile(workbookData: WorkbookData, fileName: string) {
  const html = [
    '<html>',
    '<head>',
    '<meta charset="UTF-8" />',
    '</head>',
    '<body>',
    workbookData.sheets.map(buildHtmlWorksheet).join('<br />'),
    '</body>',
    '</html>'
  ].join('');

  downloadBuffer(html, fileName, 'application/vnd.ms-excel;charset=utf-8');
}

function collectHeaders(rows: Record<string, any>[], explicitHeader?: string[]) {
  if (explicitHeader?.length) return explicitHeader;
  const headers: string[] = [];
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!headers.includes(key)) headers.push(key);
    });
  });
  return headers;
}

async function writeWorkbookFile(workbookData: WorkbookData, fileName: string) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'hr-system-3.0';
  workbook.created = new Date();

  workbookData.sheets.forEach((sheet) => {
    const worksheet = workbook.addWorksheet(sheet.name || 'Sheet1');
    const headers = collectHeaders(sheet.data.rows, sheet.data.header);
    const textColumnIndexes = new Set(
      (sheet.data.textColumns || [])
        .map((column) => headers.indexOf(column) + 1)
        .filter((index) => index > 0)
    );
    if (headers.length) worksheet.addRow(headers);

    sheet.data.rows.forEach((row) => {
      const excelRow = worksheet.addRow(
        headers.map((header, index) => {
          const value = row?.[header] ?? '';
          return textColumnIndexes.has(index + 1) ? String(value) : value;
        })
      );
      textColumnIndexes.forEach((index) => {
        excelRow.getCell(index).numFmt = '@';
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadXlsxBuffer(buffer, fileName);
}

export async function loadXlsx() {
  return {
    utils: {
      json_to_sheet(rows: Record<string, any>[], options?: { header?: string[]; textColumns?: string[] }): SheetData {
        return { rows: rows || [], header: options?.header, textColumns: options?.textColumns };
      },
      book_new(): WorkbookData {
        return { sheets: [] };
      },
      book_append_sheet(workbook: WorkbookData, sheet: SheetData, name: string) {
        workbook.sheets.push({ name, data: sheet });
      }
    },
    writeFile(workbook: WorkbookData, fileName: string, options?: WriteFileOptions) {
      const writer = options?.bookType === 'xls'
        ? Promise.resolve().then(() => writeHtmlXlsFile(workbook, fileName))
        : writeWorkbookFile(workbook, fileName);

      void writer.catch((err) => {
        console.error('[Excel] 导出失败:', err);
      });
    }
  };
}

export function assertSafeExcelFile(file: File, maxSize = MAX_EXCEL_FILE_SIZE) {
  const fileName = file.name.toLowerCase();
  const isExcel = file.type.includes('spreadsheet') || fileName.endsWith('.xlsx');

  if (!isExcel) {
    throw new Error('请上传 .xlsx 格式的 Excel 文件');
  }

  if (file.size > maxSize) {
    throw new Error(`Excel 文件不能超过 ${Math.round(maxSize / 1024 / 1024)}MB`);
  }
}

function normalizeCellValue(value: any) {
  if (value && typeof value === 'object') {
    if ('text' in value) return value.text;
    if ('result' in value) return value.result;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((item: any) => item.text || '').join('');
    }
  }
  return value ?? '';
}

export async function readExcelRows(file: File, maxRows = MAX_EXCEL_ROWS) {
  assertSafeExcelFile(file);

  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
    const header = String(normalizeCellValue(cell.value)).trim();
    headers[colNumber] = DANGEROUS_KEYS.has(header) ? '' : header;
  });

  const rows: Record<string, any>[] = [];
  const lastRow = Math.min(worksheet.rowCount, maxRows + 1);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const item: Record<string, any> = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = normalizeCellValue(row.getCell(index).value);
      item[header] = value;
      if (value !== '') hasValue = true;
    });

    if (hasValue) rows.push(item);
  }

  return rows;
}

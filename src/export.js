// exceljs and jsPDF are fairly large — load them on demand (via dynamic
// import) instead of bundling them into the main app chunk, so the initial
// page load stays fast and these only get fetched when actually exporting.

export const EXPORT_COLUMNS = [
  { key: 'no', label: 'No.', width: 6 },
  { key: 'name', label: 'ຊື (Name)', width: 28 },
  { key: 'shirtNumber', label: 'ເບີເສື້ອ (Number)', width: 10 },
  { key: 'size', label: 'Size', width: 8 },
  { key: 'status', label: 'ສະຖານະ (Status)', width: 16 },
  { key: 'imageUrl', label: 'ຫຼັກຖານການໂອນ (Payment Proof link)', width: 45 },
]

function cellValue(row, index, key) {
  switch (key) {
    case 'no':
      return row.no ?? index + 1
    case 'name':
      return row.name
    case 'shirtNumber':
      return row.shirtNumber
    case 'size':
      return row.size
    case 'status':
      return row.imageUrl ? 'ຈ່າຍແລ້ວ' : 'ຍັງບໍ່ທັນຈ່າຍ'
    case 'imageUrl':
      return row.imageUrl
    default:
      return ''
  }
}

// jsPDF's built-in fonts don't cover Lao glyphs, so the PDF export uses
// English labels for headers/status to keep it readable in any PDF viewer.
const PDF_LABELS = {
  no: 'No.',
  name: 'Name',
  shirtNumber: 'Number',
  size: 'Size',
  status: 'Status',
  imageUrl: 'Payment Proof',
}

function pdfCellValue(row, index, key) {
  if (key === 'status') return row.imageUrl ? 'Paid' : 'Unpaid'
  return cellValue(row, index, key)
}

function downloadBlob(data, filename, mimeType) {
  const blob = new Blob([data], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportToXlsx(rows, columnKeys) {
  const columns = EXPORT_COLUMNS.filter((c) => columnKeys.includes(c.key))
  if (columns.length === 0) return

  const { default: ExcelJS } = await import('exceljs')

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Team')

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.width }))
  sheet.getRow(1).font = { bold: true }

  rows.forEach((row, i) => {
    const record = {}
    columns.forEach((c) => {
      record[c.key] = cellValue(row, i, c.key)
    })
    sheet.addRow(record)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(
    buffer,
    'football-team.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

export async function exportToPdf(rows, columnKeys) {
  const columns = EXPORT_COLUMNS.filter((c) => columnKeys.includes(c.key))
  if (columns.length === 0) return

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Football Team Roster', 14, 15)

  autoTable(doc, {
    startY: 20,
    head: [columns.map((c) => PDF_LABELS[c.key])],
    body: rows.map((row, i) => columns.map((c) => pdfCellValue(row, i, c.key))),
  })

  doc.save('football-team.pdf')
}

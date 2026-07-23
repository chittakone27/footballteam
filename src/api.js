const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || ''

export const isConfigured = () => Boolean(APPS_SCRIPT_URL)

export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

async function post(payload) {
  if (!APPS_SCRIPT_URL) throw new Error('ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ VITE_APPS_SCRIPT_URL (ເບິ່ງ README).')

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!result.ok) throw new Error(result.error || 'ບັນທຶກບໍ່ສຳເລັດ')
  return result
}

export async function fetchRows() {
  if (!APPS_SCRIPT_URL) throw new Error('ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ VITE_APPS_SCRIPT_URL (ເບິ່ງ README).')

  const response = await fetch(APPS_SCRIPT_URL, { cache: 'no-store' })
  const result = await response.json()
  if (!result.ok) throw new Error(result.error || 'ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ')
  return result.rows
}

export function addRow(fields) {
  return post({ action: 'add', ...fields })
}

export function updateRow(rowIndex, fields) {
  return post({ action: 'update', rowIndex, ...fields })
}

export function deleteRow(rowIndex) {
  return post({ action: 'delete', rowIndex })
}

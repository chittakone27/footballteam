import { useEffect, useRef, useState } from 'react'
import './App.css'
import SheetRow from './SheetRow'
import { addRow, deleteRow, fetchRows, fileToBase64, isConfigured, updateRow } from './api'

const blankSnapshot = () => ({ name: '', shirtNumber: '', size: '' })

const PRICE_PER_UNIT = 130000

// Google Sheets returns numeric-looking cells (e.g. shirt numbers) as JS
// numbers, not strings — coerce everything to a string so .trim() etc. work.
const toStr = (v) => (v === null || v === undefined ? '' : String(v))

const toRowState = (r) => ({
  key: `row-${r.rowIndex}`,
  rowIndex: r.rowIndex,
  no: r.no ?? null,
  name: toStr(r.name),
  shirtNumber: toStr(r.shirtNumber),
  size: toStr(r.size),
  imageUrl: toStr(r.imageUrl),
  savedSnapshot: { name: toStr(r.name), shirtNumber: toStr(r.shirtNumber), size: toStr(r.size) },
  pendingFile: null,
  previewUrl: null,
  status: 'idle',
})

function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadError, setLoadError] = useState('')
  const newRowId = useRef(0)

  useEffect(() => {
    if (isConfigured()) load()
    else setLoading(false)
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    setLoadProgress(0)

    // Apps Script doesn't expose real download progress, so climb toward
    // 90% while waiting and snap to 100% once the data actually arrives.
    const progressTimer = setInterval(() => {
      setLoadProgress((p) => Math.min(p + Math.random() * 18, 90))
    }, 200)

    try {
      const data = await fetchRows()
      clearInterval(progressTimer)
      setLoadProgress(100)
      setRows(data.map(toRowState))
      setTimeout(() => setLoading(false), 250)
    } catch (err) {
      clearInterval(progressTimer)
      setLoadError(err.message)
      setLoading(false)
    }
  }

  function handleAddRow() {
    newRowId.current += 1
    setRows((prev) => [
      ...prev,
      {
        key: `new-${newRowId.current}`,
        rowIndex: null,
        no: null,
        name: '',
        shirtNumber: '',
        size: '',
        imageUrl: '',
        savedSnapshot: blankSnapshot(),
        pendingFile: null,
        previewUrl: null,
        status: 'idle',
      },
    ])
  }

  function handleFieldChange(key, field, value) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  async function handleFieldCommit(key, overrideFields = {}) {
    const row = rows.find((r) => r.key === key)
    if (!row) return
    const merged = { ...row, ...overrideFields }

    const dirty =
      merged.name !== row.savedSnapshot.name ||
      merged.shirtNumber !== row.savedSnapshot.shirtNumber ||
      merged.size !== row.savedSnapshot.size

    if (!dirty) return
    if (!merged.rowIndex && !merged.name.trim()) return // don't create blank rows yet

    await saveRow(key, merged)
  }

  async function handleFileChange(key, file) {
    const previewUrl = URL.createObjectURL(file)
    const row = rows.find((r) => r.key === key)
    if (!row) return
    const merged = { ...row, pendingFile: file, previewUrl }
    setRows((prev) => prev.map((r) => (r.key === key ? merged : r)))

    if (!merged.rowIndex && !merged.name.trim()) return // wait for a name before creating
    await saveRow(key, merged)
  }

  async function saveRow(key, merged) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: 'saving' } : r)))
    try {
      let fileFields = {}
      if (merged.pendingFile) {
        const base64 = await fileToBase64(merged.pendingFile)
        fileFields = {
          fileName: merged.pendingFile.name,
          mimeType: merged.pendingFile.type,
          fileData: base64,
        }
      }

      const fields = {
        name: merged.name,
        shirtNumber: merged.shirtNumber,
        size: merged.size,
        ...fileFields,
      }

      const result = merged.rowIndex
        ? await updateRow(merged.rowIndex, { ...fields, existingImageUrl: merged.imageUrl })
        : await addRow(fields)

      const saved = result.row
      setRows((prev) =>
        prev.map((r) =>
          r.key === key
            ? {
                ...r,
                rowIndex: saved.rowIndex,
                no: saved.no,
                name: toStr(saved.name),
                shirtNumber: toStr(saved.shirtNumber),
                size: toStr(saved.size),
                imageUrl: toStr(saved.imageUrl),
                savedSnapshot: {
                  name: toStr(saved.name),
                  shirtNumber: toStr(saved.shirtNumber),
                  size: toStr(saved.size),
                },
                pendingFile: null,
                previewUrl: null,
                status: 'saved',
              }
            : r
        )
      )

      setTimeout(() => {
        setRows((prev) =>
          prev.map((r) => (r.key === key && r.status === 'saved' ? { ...r, status: 'idle' } : r))
        )
      }, 1500)
    } catch (err) {
      setRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, status: 'error', errorMsg: err.message } : r))
      )
    }
  }

  async function handleRemoveImage(key) {
    const row = rows.find((r) => r.key === key)
    if (!row || !row.imageUrl) return
    if (!window.confirm(`ລຶບຮູບຫຼັກຖານການໂອນ ຂອງ "${row.name}" ບໍ?`)) return

    await saveRow(key, { ...row, imageUrl: '', pendingFile: null, previewUrl: null })
  }

  async function handleDelete(key) {
    const row = rows.find((r) => r.key === key)
    if (!row) return

    if (!row.rowIndex) {
      setRows((prev) => prev.filter((r) => r.key !== key))
      return
    }

    if (!window.confirm(`ລຶບແຖວຂອງ "${row.name}" ບໍ?`)) return

    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: 'saving' } : r)))
    try {
      await deleteRow(row.rowIndex)
      setRows((prev) =>
        prev
          .filter((r) => r.key !== key)
          .map((r) =>
            r.rowIndex && r.rowIndex > row.rowIndex
              ? { ...r, rowIndex: r.rowIndex - 1, no: r.no != null ? r.no - 1 : r.no }
              : r
          )
      )
    } catch (err) {
      setRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, status: 'error', errorMsg: err.message } : r))
      )
    }
  }

  const shirtNumberCounts = rows.reduce((counts, r) => {
    const key = r.shirtNumber.trim()
    if (key) counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})

  const paidCount = rows.filter((r) => r.imageUrl).length
  const totalCollected = paidCount * PRICE_PER_UNIT

  if (isConfigured() && loading) {
    return (
      <div className="page">
        <div className="loading-fullscreen">
          <span className="football-spinner" aria-hidden="true">
            ⚽
          </span>
          <p className="loading-percent">{Math.round(loadProgress)}%</p>
          <p className="loading-text">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="sheet-card">
        <h1>ຕາຕະລາງຊື່ເຮັດເສື້ອ</h1>

        {!isConfigured() && (
          <p className="banner banner-error">
            ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ VITE_APPS_SCRIPT_URL. ເບິ່ງ README.md ເພື່ອຕັ້ງຄ່າ Apps Script.
          </p>
        )}

        {isConfigured() && !loadError && (
          <div className="summary-card">
            <div className="summary-stat">
              <span className="summary-label">ເງິນທີ່ເກັບໄດ້ທັງໝົດ</span>
              <span className="summary-value">{totalCollected.toLocaleString()} ກີບ</span>
              <span className="summary-sub">({paidCount} ຄົນຈ່າຍແລ້ວ)</span>
            </div>
            <label className="summary-input">
              <span>ລາຄາຕໍ່ຄົນ</span>
              <input type="number" value={PRICE_PER_UNIT} disabled />
              <span>ກີບ</span>
            </label>
          </div>
        )}

        {isConfigured() && loadError && (
          <p className="banner banner-error">
            {loadError}{' '}
            <button type="button" className="link-button" onClick={load}>
              ລອງໃໝ່
            </button>
          </p>
        )}

        {isConfigured() && !loadError && (
          <div className="table-scroll">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th className="col-name">ຊື</th>
                  <th>ເບີເສື້ອ</th>
                  <th>size</th>
                  <th>ຫຼັກຖານການໂອນ (ຮູບ)</th>
                  <th>ສະຖານະ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <SheetRow
                    key={row.key}
                    row={row}
                    index={i}
                    isDuplicateShirtNumber={
                      Boolean(row.shirtNumber.trim()) && shirtNumberCounts[row.shirtNumber.trim()] > 1
                    }
                    onFieldChange={handleFieldChange}
                    onFieldCommit={handleFieldCommit}
                    onFileChange={handleFileChange}
                    onRemoveImage={handleRemoveImage}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isConfigured() && !loadError && (
          <button type="button" className="add-row-button" onClick={handleAddRow}>
            + ເພີ່ມແຖວ
          </button>
        )}
      </div>
    </div>
  )
}

export default App

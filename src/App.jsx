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

const POLL_INTERVAL_MS = 5000

// A new row only gets created once Name, Number, and Size are all filled in
// — partial data (e.g. just a name) is kept locally but never posted.
const hasRequiredFields = (row) =>
  Boolean(row.name.trim() && row.shirtNumber.trim() && row.size.trim())

// Merge freshly-fetched sheet data into local state without clobbering rows
// the user is actively editing/saving right now.
function mergeServerRows(localRows, serverRows) {
  const localByIndex = new Map(localRows.filter((r) => r.rowIndex != null).map((r) => [r.rowIndex, r]))

  const merged = serverRows.map((serverRow) => {
    const local = localByIndex.get(serverRow.rowIndex)
    if (!local) return serverRow

    const isDirty =
      local.name !== local.savedSnapshot.name ||
      local.shirtNumber !== local.savedSnapshot.shirtNumber ||
      local.size !== local.savedSnapshot.size

    const isBusy = local.status === 'saving' || local.status === 'error' || Boolean(local.pendingFile)

    return isDirty || isBusy ? local : serverRow
  })

  // Keep any not-yet-saved rows the user just added locally (rowIndex null).
  const unsavedLocalRows = localRows.filter((r) => r.rowIndex == null)
  return [...merged, ...unsavedLocalRows]
}

function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadError, setLoadError] = useState('')
  const newRowId = useRef(0)
  const rowsRef = useRef([])
  const pendingSaves = useRef(new Map())

  // rowsRef is the authoritative, synchronously-updated source of truth for
  // any logic that reads "current rows" (e.g. inside async save chains).
  // Syncing it only via a useEffect on `rows` isn't safe here: React doesn't
  // guarantee that effect runs before the next microtask in a promise chain
  // (like the next queued save in runExclusive), so a fast-fired second save
  // could still read stale data and fire a duplicate "add". Every state
  // update goes through updateRows() below, which writes the ref immediately.
  function updateRows(updater) {
    const next = typeof updater === 'function' ? updater(rowsRef.current) : updater
    rowsRef.current = next
    setRows(next)
  }

  // Ensures overlapping commits for the same row (e.g. tabbing Name -> Number
  // on a brand-new row before the first save finishes) run one after another
  // instead of both firing an "add" and creating two rows.
  function runExclusive(key, fn) {
    const prior = pendingSaves.current.get(key) || Promise.resolve()
    const next = prior.then(fn, fn).finally(() => {
      if (pendingSaves.current.get(key) === next) {
        pendingSaves.current.delete(key)
      }
    })
    pendingSaves.current.set(key, next)
    return next
  }

  useEffect(() => {
    if (isConfigured()) load()
    else setLoading(false)
  }, [])

  // Poll in the background so changes made elsewhere (another device, or
  // edits made directly in Google Sheets) show up without a manual refresh.
  useEffect(() => {
    if (!isConfigured()) return
    const interval = setInterval(silentRefresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  async function silentRefresh() {
    try {
      const data = await fetchRows()
      const serverRows = data.map(toRowState)
      updateRows((prev) => mergeServerRows(prev, serverRows))
    } catch {
      // Silent — don't disrupt the UI over a background poll failure.
    }
  }

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
      updateRows(data.map(toRowState))
      setTimeout(() => setLoading(false), 250)
    } catch (err) {
      clearInterval(progressTimer)
      setLoadError(err.message)
      setLoading(false)
    }
  }

  function handleAddRow() {
    newRowId.current += 1
    updateRows((prev) => [
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
    updateRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  async function handleFieldCommit(key, overrideFields = {}) {
    await runExclusive(key, async () => {
      const row = rowsRef.current.find((r) => r.key === key)
      if (!row) return
      const merged = { ...row, ...overrideFields }

      const dirty =
        merged.name !== row.savedSnapshot.name ||
        merged.shirtNumber !== row.savedSnapshot.shirtNumber ||
        merged.size !== row.savedSnapshot.size

      if (!dirty) return
      if (!merged.rowIndex && !hasRequiredFields(merged)) return // wait for name+number+size before creating

      await saveRow(key, merged)
    })
  }

  async function handleFileChange(key, file) {
    const previewUrl = URL.createObjectURL(file)
    updateRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, pendingFile: file, previewUrl } : r))
    )

    await runExclusive(key, async () => {
      const row = rowsRef.current.find((r) => r.key === key)
      if (!row) return
      const merged = { ...row, pendingFile: file, previewUrl }

      if (!merged.rowIndex && !hasRequiredFields(merged)) return // wait for name+number+size before creating
      await saveRow(key, merged)
    })
  }

  async function saveRow(key, merged) {
    updateRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: 'saving' } : r)))
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
      const confirmedSnapshot = {
        name: toStr(saved.name),
        shirtNumber: toStr(saved.shirtNumber),
        size: toStr(saved.size),
      }

      updateRows((prev) =>
        prev.map((r) => {
          if (r.key !== key) return r

          // Only adopt the server-echoed text fields if nothing changed
          // locally while this save was in flight — otherwise a newer edit
          // (typed into another field, or this one, during the round trip)
          // would get silently wiped out. The row still shows as "dirty"
          // against the new savedSnapshot, so any newer edit auto-saves on
          // the next commit instead of being lost.
          const noNewerEdits =
            r.name === merged.name && r.shirtNumber === merged.shirtNumber && r.size === merged.size

          return {
            ...r,
            rowIndex: saved.rowIndex,
            no: saved.no,
            imageUrl: toStr(saved.imageUrl),
            ...(noNewerEdits ? confirmedSnapshot : {}),
            savedSnapshot: confirmedSnapshot,
            pendingFile: null,
            previewUrl: null,
            status: 'saved',
          }
        })
      )

      setTimeout(() => {
        updateRows((prev) =>
          prev.map((r) => (r.key === key && r.status === 'saved' ? { ...r, status: 'idle' } : r))
        )
      }, 1500)
    } catch (err) {
      updateRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, status: 'error', errorMsg: err.message } : r))
      )
    }
  }

  async function handleRemoveImage(key) {
    const current = rowsRef.current.find((r) => r.key === key)
    if (!current || !current.imageUrl) return
    if (!window.confirm(`ລຶບຮູບຫຼັກຖານການໂອນ ຂອງ "${current.name}" ບໍ?`)) return

    await runExclusive(key, async () => {
      const row = rowsRef.current.find((r) => r.key === key)
      if (!row || !row.imageUrl) return
      await saveRow(key, { ...row, imageUrl: '', pendingFile: null, previewUrl: null })
    })
  }

  async function handleDelete(key) {
    const row = rowsRef.current.find((r) => r.key === key)
    if (!row) return

    if (!row.rowIndex) {
      updateRows((prev) => prev.filter((r) => r.key !== key))
      return
    }

    if (!window.confirm(`ລຶບແຖວຂອງ "${row.name}" ບໍ?`)) return

    updateRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: 'saving' } : r)))
    try {
      await deleteRow(row.rowIndex)
      updateRows((prev) =>
        prev
          .filter((r) => r.key !== key)
          .map((r) =>
            r.rowIndex && r.rowIndex > row.rowIndex
              ? { ...r, rowIndex: r.rowIndex - 1, no: r.no != null ? r.no - 1 : r.no }
              : r
          )
      )
    } catch (err) {
      updateRows((prev) =>
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

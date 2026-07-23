import { useEffect, useRef, useState } from 'react'
import './App.css'
import SheetRow from './SheetRow'
import { addRow, deleteRow, fetchRows, fileToBase64, isConfigured, updateRow } from './api'

const blankSnapshot = () => ({ name: '', shirtNumber: '', size: '' })

const toRowState = (r) => ({
  key: `row-${r.rowIndex}`,
  rowIndex: r.rowIndex,
  no: r.no ?? null,
  name: r.name || '',
  shirtNumber: r.shirtNumber || '',
  size: r.size || '',
  imageUrl: r.imageUrl || '',
  savedSnapshot: { name: r.name || '', shirtNumber: r.shirtNumber || '', size: r.size || '' },
  pendingFile: null,
  previewUrl: null,
  status: 'idle',
})

function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const newRowId = useRef(0)

  useEffect(() => {
    if (isConfigured()) load()
    else setLoading(false)
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await fetchRows()
      setRows(data.map(toRowState))
    } catch (err) {
      setLoadError(err.message)
    } finally {
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
                name: saved.name,
                shirtNumber: saved.shirtNumber,
                size: saved.size,
                imageUrl: saved.imageUrl,
                savedSnapshot: { name: saved.name, shirtNumber: saved.shirtNumber, size: saved.size },
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

  return (
    <div className="page">
      <div className="sheet-card">
        <h1>ຕາຕະລາງຊື່ເຮັດເສື້ອ</h1>

        {!isConfigured() && (
          <p className="banner banner-error">
            ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ VITE_APPS_SCRIPT_URL. ເບິ່ງ README.md ເພື່ອຕັ້ງຄ່າ Apps Script.
          </p>
        )}

        {isConfigured() && loading && <p className="banner">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>}

        {isConfigured() && loadError && (
          <p className="banner banner-error">
            {loadError}{' '}
            <button type="button" className="link-button" onClick={load}>
              ລອງໃໝ່
            </button>
          </p>
        )}

        {isConfigured() && !loading && !loadError && (
          <div className="table-scroll">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th>ຊື</th>
                  <th>ເບີເສື້ອ</th>
                  <th>size</th>
                  <th>ຫຼັກຖານການໂອນ (ຮູບ)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <SheetRow
                    key={row.key}
                    row={row}
                    index={i}
                    onFieldChange={handleFieldChange}
                    onFieldCommit={handleFieldCommit}
                    onFileChange={handleFileChange}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isConfigured() && !loading && !loadError && (
          <button type="button" className="add-row-button" onClick={handleAddRow}>
            + ເພີ່ມແຖວ
          </button>
        )}
      </div>
    </div>
  )
}

export default App

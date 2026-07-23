import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App as AntdApp,
  Button,
  ConfigProvider,
  Flex,
  InputNumber,
  Space,
  Statistic,
  Table,
  Typography,
  theme as antdTheme,
} from 'antd'
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons'
import './App.css'
import ExportModal from './ExportModal'
import { buildColumns } from './columns'
import { addRow, deleteRow, fetchRows, fileToBase64, isConfigured, updateRow } from './api'
import { EXPORT_COLUMNS, exportToPdf, exportToXlsx } from './export'

const blankSnapshot = () => ({ name: '', shirtNumber: '', size: '' })

const PRICE_PER_UNIT = 170000

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

function usePrefersDark() {
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setPrefersDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return prefersDark
}

function App() {
  const prefersDark = usePrefersDark()

  const themeConfig = {
    algorithm: prefersDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: { colorPrimary: '#aa3bff', fontFamily: 'var(--sans)' },
    components: {
      Table: { headerBg: prefersDark ? '#374151' : '#e5e7eb' },
    },
  }

  return (
    <ConfigProvider theme={themeConfig}>
      <AntdApp>
        <AppContent prefersDark={prefersDark} />
      </AntdApp>
    </ConfigProvider>
  )
}

function AppContent({ prefersDark }) {
  const { message } = AntdApp.useApp()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [exportModal, setExportModal] = useState(null)
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

    // Apps Script doesn't expose real upload progress, so climb toward 90%
    // while waiting and snap to 100% once the save actually completes —
    // same simulated-percentage approach as the initial page load.
    const messageKey = `save-${key}`
    let saveProgress = 0
    const showProgress = () =>
      message.open({
        key: messageKey,
        type: 'loading',
        content: `ກຳລັງບັນທຶກ... ${Math.round(saveProgress)}%`,
        duration: 0,
      })
    showProgress()
    const progressTimer = setInterval(() => {
      saveProgress = Math.min(saveProgress + Math.random() * 20, 90)
      showProgress()
    }, 200)

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

      clearInterval(progressTimer)
      message.open({ key: messageKey, type: 'success', content: 'ບັນທຶກແລ້ວ 100%', duration: 2 })

      setTimeout(() => {
        updateRows((prev) =>
          prev.map((r) => (r.key === key && r.status === 'saved' ? { ...r, status: 'idle' } : r))
        )
      }, 1500)
    } catch (err) {
      clearInterval(progressTimer)
      message.open({ key: messageKey, type: 'error', content: 'ບັນທຶກບໍ່ສຳເລັດ', duration: 3 })
      updateRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, status: 'error', errorMsg: err.message } : r))
      )
    }
  }

  async function handleRemoveImage(key) {
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

  function openExportModal(format) {
    setExportModal({
      format,
      selected: Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, true])),
    })
  }

  function toggleExportColumn(key) {
    setExportModal((prev) =>
      prev ? { ...prev, selected: { ...prev.selected, [key]: !prev.selected[key] } } : prev
    )
  }

  async function confirmExport() {
    if (!exportModal) return
    const columnKeys = EXPORT_COLUMNS.filter((c) => exportModal.selected[c.key]).map((c) => c.key)

    try {
      if (exportModal.format === 'xlsx') {
        await exportToXlsx(rows, columnKeys)
      } else {
        await exportToPdf(rows, columnKeys)
      }
    } catch {
      window.alert(exportModal.format === 'xlsx' ? 'Export Excel ບໍ່ສຳເລັດ' : 'Export PDF ບໍ່ສຳເລັດ')
    } finally {
      setExportModal(null)
    }
  }

  const shirtNumberCounts = rows.reduce((counts, r) => {
    const key = r.shirtNumber.trim()
    if (key) counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})

  const paidCount = rows.filter((r) => r.imageUrl).length
  const totalCollected = paidCount * PRICE_PER_UNIT

  const columns = useMemo(
    () =>
      buildColumns({
        shirtNumberCounts,
        onFieldChange: handleFieldChange,
        onFieldCommit: handleFieldCommit,
        onFileChange: handleFileChange,
        onRemoveImage: handleRemoveImage,
        onDelete: handleDelete,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows]
  )

  if (isConfigured() && loading) {
    return (
      <Flex vertical align="center" justify="center" style={{ minHeight: '100svh', gap: 14 }}>
        <span className="football-spinner" aria-hidden="true">
          ⚽
        </span>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {Math.round(loadProgress)}%
        </Typography.Title>
        <Typography.Text type="secondary">ກຳລັງໂຫຼດຂໍ້ມູນ...</Typography.Text>
      </Flex>
    )
  }

  return (
    <div className="page">
      <div className="sheet-card">
          <Typography.Title level={3} style={{ marginBottom: 16 }}>
            ຕາຕະລາງຊື່ເຮັດເສື້ອ
          </Typography.Title>

          {!isConfigured() && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="ຍັງບໍ່ໄດ້ຕັ້ງຄ່າ VITE_APPS_SCRIPT_URL. ເບິ່ງ README.md ເພື່ອຕັ້ງຄ່າ Apps Script."
            />
          )}

          {isConfigured() && !loadError && (
            <Flex
              wrap
              align="center"
              justify="space-between"
              gap={16}
              style={{
                padding: '16px 20px',
                marginBottom: 16,
                borderRadius: 10,
                border: '1px solid rgba(127,127,127,0.3)',
                background: prefersDark ? '#374151' : '#e5e7eb',
              }}
            >
              <Statistic
                title="ເງິນທີ່ເກັບໄດ້ທັງໝົດ"
                value={totalCollected}
                suffix="ກີບ"
                formatter={(value) => value.toLocaleString()}
              />
              <Typography.Text type="secondary">({paidCount} ຄົນຈ່າຍແລ້ວ)</Typography.Text>
              <Space>
                <Typography.Text>ລາຄາຕໍ່ຄົນ</Typography.Text>
                <InputNumber value={PRICE_PER_UNIT} disabled />
                <Typography.Text>ກີບ</Typography.Text>
              </Space>
            </Flex>
          )}

          {isConfigured() && !loadError && rows.length > 0 && (
            <Space style={{ marginBottom: 16 }}>
              <Button icon={<DownloadOutlined />} onClick={() => openExportModal('xlsx')}>
                Export Excel
              </Button>
              <Button icon={<DownloadOutlined />} onClick={() => openExportModal('pdf')}>
                Export PDF
              </Button>
            </Space>
          )}

          {isConfigured() && loadError && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <>
                  {loadError}{' '}
                  <Button type="link" size="small" onClick={load}>
                    ລອງໃໝ່
                  </Button>
                </>
              }
            />
          )}

          {isConfigured() && !loadError && (
            <Table
              rowKey="key"
              dataSource={rows}
              columns={columns}
              pagination={false}
              scroll={{ x: 'max-content' }}
              rowClassName={(record) => (record.status === 'error' ? 'row-error' : '')}
              footer={() => (
                <Button type="dashed" block icon={<PlusOutlined />} onClick={handleAddRow}>
                  ເພີ່ມແຖວ
                </Button>
              )}
            />
          )}
        </div>

        {exportModal && (
          <ExportModal
            format={exportModal.format}
            columns={EXPORT_COLUMNS}
            selected={exportModal.selected}
            onToggle={toggleExportColumn}
            onCancel={() => setExportModal(null)}
            onConfirm={confirmExport}
          />
        )}
      </div>
  )
}

export default App


import { useRef } from 'react'
import { driveThumbnailUrl } from './driveUrl'

const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'XXL', '3XL']

const STATUS_LABEL = {
  saving: 'ກຳລັງບັນທຶກ...',
  saved: '✓ ບັນທຶກແລ້ວ',
  error: 'ບໍ່ສຳເລັດ',
}

function SheetRow({ row, index, onFieldChange, onFieldCommit, onFileChange, onDelete }) {
  const fileInputRef = useRef(null)
  const thumb = row.previewUrl || driveThumbnailUrl(row.imageUrl)
  const linkHref = row.previewUrl || row.imageUrl

  return (
    <tr className={row.status === 'error' ? 'row-error' : undefined}>
      <td className="col-num">{row.no ?? index + 1}</td>
      <td>
        <input
          type="text"
          value={row.name}
          placeholder="ພິມຊື່ທີ່ນີ້..."
          onChange={(e) => onFieldChange(row.key, 'name', e.target.value)}
          onBlur={() => onFieldCommit(row.key)}
        />
      </td>
      <td>
        <input
          type="text"
          value={row.shirtNumber}
          onChange={(e) => onFieldChange(row.key, 'shirtNumber', e.target.value)}
          onBlur={() => onFieldCommit(row.key)}
        />
      </td>
      <td>
        <select
          value={row.size}
          onChange={(e) => {
            onFieldChange(row.key, 'size', e.target.value)
            onFieldCommit(row.key, { size: e.target.value })
          }}
        >
          <option value="" disabled hidden>
            ເລືອກ size
          </option>
          {SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="col-image">
        <div className="image-cell">
          {thumb ? (
            <a href={linkHref} target="_blank" rel="noreferrer">
              <img src={thumb} alt="ຫຼັກຖານການໂອນ" />
            </a>
          ) : (
            <span className="no-image">ບໍ່ມີຮູບ</span>
          )}
          <button
            type="button"
            className="link-button"
            onClick={() => fileInputRef.current?.click()}
          >
            {thumb ? 'ປ່ຽນຮູບ' : 'ເລືອກຮູບ'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileChange(row.key, file)
              e.target.value = ''
            }}
          />
        </div>
      </td>
      <td className="col-actions">
        {row.status && row.status !== 'idle' && (
          <span
            className={`row-status status-${row.status}`}
            title={row.status === 'error' ? row.errorMsg : undefined}
          >
            {STATUS_LABEL[row.status]}
          </span>
        )}
        <button type="button" className="delete-button" onClick={() => onDelete(row.key)}>
          ລຶບ
        </button>
      </td>
    </tr>
  )
}

export default SheetRow

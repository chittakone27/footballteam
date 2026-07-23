import { Button, Checkbox, Modal, Space, Typography } from 'antd'

function ExportModal({ format, columns, selected, onToggle, onCancel, onConfirm }) {
  const title = format === 'xlsx' ? 'ເລືອກຄໍລໍາ — Export to Excel' : 'ເລືອກຄໍລໍາ — Export to PDF'
  const noneSelected = columns.every((c) => !selected[c.key])

  return (
    <Modal
      open
      title={title}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          ຍົກເລີກ
        </Button>,
        <Button key="confirm" type="primary" disabled={noneSelected} onClick={onConfirm}>
          Export
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary">
        ເລືອກຄໍລໍາທີ່ຕ້ອງການລວມໄວ້ໃນໄຟລ໌ Export
      </Typography.Paragraph>

      <Space direction="vertical" size={10}>
        {columns.map((c) => (
          <Checkbox
            key={c.key}
            checked={Boolean(selected[c.key])}
            onChange={() => onToggle(c.key)}
          >
            {c.label}
          </Checkbox>
        ))}
      </Space>
    </Modal>
  )
}

export default ExportModal

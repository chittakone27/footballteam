import { Button, Input, Popconfirm, Select, Space, Tag, Typography, Upload } from 'antd'
import { driveThumbnailUrl } from './driveUrl'

const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'XXL', '3XL'].map((s) => ({ value: s, label: s }))

export function buildColumns({
  shirtNumberCounts,
  onFieldChange,
  onFieldCommit,
  onFileChange,
  onRemoveImage,
  onDelete,
}) {
  return [
    {
      title: '#',
      key: 'no',
      width: 56,
      render: (_, record, index) => record.no ?? index + 1,
    },
    {
      title: 'ຊື',
      key: 'name',
      width: 200,
      render: (_, record) => (
        <Input
          value={record.name}
          placeholder="ພິມຊື່ທີ່ນີ້..."
          onChange={(e) => onFieldChange(record.key, 'name', e.target.value)}
          onBlur={() => onFieldCommit(record.key)}
        />
      ),
    },
    {
      title: 'ເບີເສື້ອ',
      key: 'shirtNumber',
      width: 140,
      render: (_, record) => {
        const trimmed = record.shirtNumber.trim()
        const isDuplicate = Boolean(trimmed) && shirtNumberCounts[trimmed] > 1
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Input
              value={record.shirtNumber}
              onChange={(e) => onFieldChange(record.key, 'shirtNumber', e.target.value)}
              onBlur={() => onFieldCommit(record.key)}
            />
            {isDuplicate && <Tag color="error">ເບີເສື້ອຊໍ້າກັນ</Tag>}
          </Space>
        )
      },
    },
    {
      title: 'size',
      key: 'size',
      width: 110,
      render: (_, record) => (
        <Select
          value={record.size || undefined}
          placeholder="ເລືອກ size"
          style={{ width: '100%' }}
          options={SIZE_OPTIONS}
          onChange={(value) => {
            onFieldChange(record.key, 'size', value)
            onFieldCommit(record.key, { size: value })
          }}
        />
      ),
    },
    {
      title: 'ຫຼັກຖານການໂອນ (ຮູບ)',
      key: 'image',
      width: 220,
      render: (_, record) => {
        const thumb = record.previewUrl || driveThumbnailUrl(record.imageUrl)
        const linkHref = record.previewUrl || record.imageUrl
        return (
          <Space align="center" wrap>
            {thumb ? (
              <a href={linkHref} target="_blank" rel="noreferrer">
                <img
                  src={thumb}
                  alt="ຫຼັກຖານການໂອນ"
                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                />
              </a>
            ) : (
              <Typography.Text type="secondary">ບໍ່ມີຮູບ</Typography.Text>
            )}
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                onFileChange(record.key, file)
                return false
              }}
            >
              <Button type="link" size="small">
                {thumb ? 'ປ່ຽນຮູບ' : 'ເລືອກຮູບ'}
              </Button>
            </Upload>
            {thumb && (
              <Popconfirm
                title={`ລຶບຮູບຫຼັກຖານການໂອນ ຂອງ "${record.name}" ບໍ?`}
                okText="ລຶບ"
                cancelText="ຍົກເລີກ"
                onConfirm={() => onRemoveImage(record.key)}
              >
                <Button type="link" danger size="small">
                  ລຶບຮູບ
                </Button>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
    {
      title: 'ສະຖານະ',
      key: 'status',
      width: 130,
      render: (_, record) =>
        record.imageUrl ? (
          <Tag color="success">ຈ່າຍແລ້ວ</Tag>
        ) : (
          <Tag color="warning">ຍັງບໍ່ທັນຈ່າຍ</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          {record.status === 'error' && (
            <Typography.Text type="danger" title={record.errorMsg} style={{ fontSize: 12 }}>
              ບໍ່ສຳເລັດ
            </Typography.Text>
          )}
          <Popconfirm
            title={`ລຶບແຖວຂອງ "${record.name}" ບໍ?`}
            okText="ລຶບ"
            cancelText="ຍົກເລີກ"
            onConfirm={() => onDelete(record.key)}
          >
            <Button type="link" danger size="small">
              ລຶບ
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]
}

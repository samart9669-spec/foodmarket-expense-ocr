const POSITION_LABELS: Record<string, { label: string; className: string }> = {
  kitchen: { label: 'ครัวกลาง', className: 'badge-kitchen' },
  sales: { label: 'พนักงานขาย', className: 'badge-sales' },
  head_office: {
    label: 'Head Office',
    className: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200',
  },
}

interface EmployeeTypeTagProps {
  type: string
  jobTitle?: string
  salaryType?: string
  className?: string
}

export default function EmployeeTypeTag({ type, jobTitle, salaryType, className = '' }: EmployeeTypeTagProps) {
  const effectiveTitle = jobTitle || type
  const preset = POSITION_LABELS[effectiveTitle]

  const positionTag = preset ? (
    <span className={`${preset.className} ${className}`}>{preset.label}</span>
  ) : effectiveTitle ? (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 ${className}`}>
      {effectiveTitle}
    </span>
  ) : (
    <span className={`badge-kitchen ${className}`}>ครัวกลาง</span>
  )

  if (salaryType === 'monthly') {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {positionTag}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
          รายเดือน
        </span>
      </span>
    )
  }
  return positionTag
}

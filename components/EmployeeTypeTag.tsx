interface EmployeeTypeTagProps {
  type: string
  salaryType?: string
  className?: string
}

export default function EmployeeTypeTag({ type, salaryType, className = '' }: EmployeeTypeTagProps) {
  const typeTag = type === 'kitchen'
    ? <span className={`badge-kitchen ${className}`}>ครัวกลาง</span>
    : <span className={`badge-sales ${className}`}>พนักงานขาย</span>

  if (salaryType === 'monthly') {
    return (
      <span className="inline-flex items-center gap-1 flex-wrap">
        {typeTag}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
          รายเดือน
        </span>
      </span>
    )
  }
  return typeTag
}

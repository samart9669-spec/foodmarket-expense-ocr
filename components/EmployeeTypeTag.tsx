interface EmployeeTypeTagProps {
  type: string
  className?: string
}

export default function EmployeeTypeTag({ type, className = '' }: EmployeeTypeTagProps) {
  if (type === 'kitchen') {
    return (
      <span className={`badge-kitchen ${className}`}>
        ครัวกลาง
      </span>
    )
  }
  return (
    <span className={`badge-sales ${className}`}>
      พนักงานขาย
    </span>
  )
}

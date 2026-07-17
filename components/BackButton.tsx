'use client'

import { useRouter } from 'next/navigation'

interface BackButtonProps {
  href: string
  label?: string
  className?: string
}

export default function BackButton({ href, label, className = '' }: BackButtonProps) {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push(href)}
      className={`flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors group ${className}`}
    >
      <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  )
}

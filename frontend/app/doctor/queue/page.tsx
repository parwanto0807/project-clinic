'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DoctorQueueRedirect() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/doctor')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/30">
      <div className="animate-pulse flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Mengalihkan ke Dashboard Antrian...</p>
      </div>
    </div>
  )
}

import { Loader2 } from 'lucide-react'

export function LoadingSpinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} style={{ width: size, height: size }} />
}

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner size={32} className="text-primary-600" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

import { AlertTriangle, KeyRound, Terminal, ExternalLink } from 'lucide-react'

export function ConfigBanner() {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-900 px-4 py-3 shadow-inner">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">Supabase Credentials Required</p>
            <p className="text-amber-800 text-xs md:text-sm mt-0.5">
              The app is currently running in preview mode without active Supabase credentials. Add <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-xs text-amber-950 font-bold">VITE_SUPABASE_URL</code> and <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-xs text-amber-950 font-bold">VITE_SUPABASE_ANON_KEY</code> to your <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-xs text-amber-950 font-bold">.env</code> file.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm"
          >
            <span>Supabase Dashboard</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

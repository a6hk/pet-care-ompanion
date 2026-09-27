import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { PawPrint, Mail, Lock, KeyRound, CheckCircle2, AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Modal } from '@/components/Modal'

export function LoginPage() {
  const { signIn, resetPasswordToDefault } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Reset password modal state
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      navigate('/app')
    }
  }

  function handleOpenResetModal() {
    setResetEmail(email.trim())
    setResetError(null)
    setResetSuccess(false)
    setShowResetModal(true)
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault()
    setResetError(null)
    setResetSuccess(false)
    setResetLoading(true)

    const { error: resetErr } = await resetPasswordToDefault(resetEmail)
    setResetLoading(false)

    if (resetErr) {
      setResetError(resetErr)
    } else {
      setResetSuccess(true)
      // Auto-populate the login fields for immediate convenience
      setEmail(resetEmail)
      setPassword('Welcome1')
      setError(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50/80 via-white to-secondary-50/70 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left Column: Visual Showcase with og-image.png */}
        <div className="lg:col-span-5 bg-gradient-to-b from-primary-900 via-primary-800 to-emerald-950 p-6 sm:p-8 flex flex-col justify-between text-white relative overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-accent-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Top Brand & Badge */}
          <div className="relative z-10">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-sm">
                <PawPrint className="w-6 h-6 text-primary-300" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight text-white">PawCare</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-500/20 border border-primary-400/30 text-xs font-medium text-primary-200 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-accent-400" />
              <span>Smart Family Pet Companion</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight leading-snug">
              Welcome back to PawCare
            </h2>
            <p className="text-primary-100/80 text-xs sm:text-sm mt-1.5 leading-relaxed">
              Sign in to manage routines, coordinate with family, and access AI veterinary assistance.
            </p>
          </div>

          {/* Feature Image: og-image.png */}
          <div className="my-5 relative z-10 group">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-primary-950/40 transform transition-transform duration-300 group-hover:scale-[1.02]">
              <img
                src="/og-image.png"
                alt="PawCare Pet Care Companion Preview"
                className="w-full h-auto object-cover aspect-[16/9]"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-950/60 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>

          {/* Bottom Trust Highlights */}
          <div className="space-y-2 relative z-10 text-xs text-primary-100/90 pt-3 border-t border-white/10">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Real-time routine check-ins & health history</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Multi-device family synchronization</span>
            </div>
          </div>
        </div>

        {/* Right Column: Sign In Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Sign in to your account</h1>
              <p className="text-sm text-gray-500 mt-1">Manage your pets and daily care schedules</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="jane@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Password</label>
                  <button
                    type="button"
                    onClick={handleOpenResetModal}
                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
                  >
                    Forgot / Reset password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-10"
                    placeholder="Your password"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-slide-down">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 text-sm font-semibold shadow-md mt-2 flex items-center justify-center gap-2"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary-600 font-semibold hover:text-primary-700 hover:underline">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      <Modal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Reset Password to Default"
        size="sm"
      >
        {resetSuccess ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 text-green-800 border border-green-200">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Password Reset Successful!</h4>
                <p className="text-xs text-green-700 mt-1">
                  Your password for <strong className="font-semibold">{resetEmail}</strong> has been reset to the default:
                </p>
                <div className="mt-2.5 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-green-200 font-mono text-sm font-bold text-gray-900 shadow-sm">
                  <KeyRound className="w-4 h-4 text-primary-600" />
                  <span>Welcome1</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              We have automatically pre-filled this password into your login form for you.
            </p>

            <button
              type="button"
              onClick={() => setShowResetModal(false)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <span>Back to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter your account email. Your password will be immediately reset to the system default password:
            </p>

            <div className="p-3 bg-primary-50/70 border border-primary-100 rounded-xl flex items-center justify-between text-xs text-primary-900">
              <span className="font-medium">Default Password:</span>
              <code className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-primary-200 text-primary-700">
                Welcome1
              </code>
            </div>

            <div>
              <label className="label">Account Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="jane@example.com"
                  required
                />
              </div>
            </div>

            {resetError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 animate-slide-down">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs">{resetError}</div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="btn-secondary flex-1"
                disabled={resetLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetLoading}
                className="btn-primary flex-1"
              >
                {resetLoading ? 'Resetting...' : 'Reset to Default'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

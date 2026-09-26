import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { PawPrint, Mail, Lock, KeyRound, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 via-white to-secondary-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 rounded-2xl bg-primary-600 text-white mb-3">
            <PawPrint className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to manage your pet care</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
            <div className="text-sm text-error-600 bg-error-50 rounded-lg px-4 py-3 animate-slide-down">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary-600 font-medium hover:underline">
            Sign up
          </Link>
        </p>
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
            <div className="flex items-start gap-3 p-4 rounded-xl bg-success-50 text-success-800 border border-success-200">
              <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Password Reset Successful!</h4>
                <p className="text-xs text-success-700 mt-1">
                  Your password for <strong className="font-semibold">{resetEmail}</strong> has been reset to the default:
                </p>
                <div className="mt-2.5 inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-success-200 font-mono text-sm font-bold text-gray-900 shadow-sm">
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
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              <div className="text-sm text-error-700 bg-error-50 border border-error-200 rounded-xl p-3 flex items-start gap-2 animate-slide-down">
                <AlertCircle className="w-4 h-4 text-error-500 flex-shrink-0 mt-0.5" />
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

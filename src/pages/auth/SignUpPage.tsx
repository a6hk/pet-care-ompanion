import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { PawPrint, Mail, Lock, User, Sparkles, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function SignUpPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signUp(email, password, fullName)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      navigate('/app')
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
              Happier Pets, Healthier Lives
            </h2>
            <p className="text-primary-100/80 text-xs sm:text-sm mt-1.5 leading-relaxed">
              Coordinate routines, access AI vet consultations, and track health together.
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
              <span>Instant AI vet discharge & routine checklists</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Shared family schedules & automated reminders</span>
            </div>
          </div>
        </div>

        {/* Right Column: Sign Up Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create your account</h1>
              <p className="text-sm text-gray-500 mt-1">Join PawCare today and care for your pets together</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Full name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input pl-10"
                    placeholder="Jane Smith"
                    required
                  />
                </div>
              </div>

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
                <label className="label">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-10"
                    placeholder="At least 6 characters"
                    minLength={6}
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
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 font-semibold hover:text-primary-700 hover:underline">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

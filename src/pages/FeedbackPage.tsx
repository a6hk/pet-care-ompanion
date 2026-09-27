import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useFamily } from '@/context/FamilyContext'
import { supabase } from '@/lib/supabase'
import {
  MessageSquare,
  AlertCircle,
  Sparkles,
  Heart,
  Upload,
  Image as ImageIcon,
  X,
  CheckCircle2,
  Send,
  Loader2,
  Clock,
  HelpCircle,
  ExternalLink,
  Mail,
  Filter,
  Check,
  Search,
  MessageCircleQuestion,
  ChevronDown,
  Info
} from 'lucide-react'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import type { FeedbackType, FeedbackSubmission } from '@/types'

export function FeedbackPage() {
  const { user, profile } = useAuth()
  const { family } = useFamily()

  const [type, setType] = useState<FeedbackType>('feedback')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successTicket, setSuccessTicket] = useState<{
    id: string
    type: FeedbackType
    summary: string
    details: string
    emailSent?: boolean
  } | null>(null)
  const [mySubmissions, setMySubmissions] = useState<FeedbackSubmission[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<'all' | FeedbackType>('all')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const targetFeedbackEmail = import.meta.env.VITE_FEEDBACK_EMAIL || 'kj.ashutosh@gmail.com'
  const feedbackEndpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT

  // Load past submissions from local storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('petpal_feedback_submissions')
      if (saved) {
        setMySubmissions(JSON.parse(saved))
      }
    } catch {}
  }, [])

  const ALLOWED_IMAGE_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }

  // Clipboard paste listener for screenshots
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (showHistory || successTicket) return
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const itemType = items[i].type
        if (ALLOWED_IMAGE_TYPES[itemType]) {
          const file = items[i].getAsFile()
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              setError('Pasted image must be under 5MB')
              return
            }
            setImageFile(file)
            setError(null)
            const reader = new FileReader()
            reader.onload = () => {
              setImagePreview(reader.result as string)
            }
            reader.readAsDataURL(file)
            break
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [showHistory, successTicket])

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setError('Image file must be under 5MB')
      return
    }

    if (!ALLOWED_IMAGE_TYPES[file.type]) {
      setError('Only JPEG, PNG, WebP, and GIF images are allowed')
      return
    }

    setImageFile(file)
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanSummary = summary.trim()
    const cleanDetails = details.trim()

    if (!cleanSummary) {
      setError('Please provide a brief summary of your feedback')
      return
    }
    if (cleanSummary.length > 200) {
      setError('Summary must be 200 characters or less')
      return
    }
    if (!cleanDetails) {
      setError('Please provide details so our team can assist you')
      return
    }
    if (cleanDetails.length > 4000) {
      setError('Details must be 4000 characters or less')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      let finalImageUrl: string | null = null

      // Upload image if selected
      if (imageFile) {
        setUploadingImage(true)
        try {
          const safeExt = ALLOWED_IMAGE_TYPES[imageFile.type] || 'png'
          const filePath = `feedback/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('pet-assets')
            .upload(filePath, imageFile, { cacheControl: '3600', upsert: true })

          if (!uploadError && uploadData) {
            const { data: pubData } = supabase.storage
              .from('pet-assets')
              .getPublicUrl(uploadData.path)
            finalImageUrl = pubData.publicUrl
          } else {
            // Fallback to preview data URL if storage bucket fails
            finalImageUrl = imagePreview
          }
        } catch {
          finalImageUrl = imagePreview
        } finally {
          setUploadingImage(false)
        }
      }

      const ticketId = `FB-${Math.floor(1000 + Math.random() * 9000)}`
      const newSubmission: FeedbackSubmission = {
        id: ticketId,
        user_id: user?.id || 'guest',
        user_email: user?.email || profile?.email || 'user@petpal.app',
        family_id: family?.id || null,
        type,
        summary: summary.trim(),
        details: details.trim(),
        image_url: finalImageUrl,
        created_at: new Date().toISOString(),
      }

      // 1. Send email notification if an endpoint is configured
      let emailDispatched = false
      if (feedbackEndpoint) {
        try {
          const res = await fetch(feedbackEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              _subject: `[PawCare Feedback - ${type.toUpperCase()}] ${summary.trim()}`,
              ticket_id: ticketId,
              category: type,
              summary: summary.trim(),
              details: details.trim(),
              user_name: profile?.full_name || 'Member',
              user_email: user?.email || profile?.email || 'user@pawcare.app',
              family_name: family?.name || 'N/A',
              screenshot_url: finalImageUrl || 'None',
              to_email: targetFeedbackEmail,
              submitted_at: new Date().toISOString(),
            }),
          })
          if (res.ok) {
            emailDispatched = true
          }
        } catch (mailErr) {
          console.warn('Feedback email dispatch error:', mailErr)
        }
      }

      // 2. Try inserting into Supabase feedback table
      try {
        await supabase.from('feedback').insert({
          id: ticketId,
          user_id: user?.id,
          user_email: user?.email || '',
          family_id: family?.id,
          type,
          summary: summary.trim(),
          details: details.trim(),
          image_url: finalImageUrl,
        })
      } catch (err) {
        console.warn('Direct feedback table insert bypassed, using activity log fallback:', err)
      }

      // 3. Record to family activity log
      if (family && user) {
        try {
          await supabase.from('activity_log').insert({
            family_id: family.id,
            user_id: user.id,
            user_email: user.email || '',
            action: 'submitted_feedback',
            details: `[${type.toUpperCase()}] ${summary.trim()}`,
          })
        } catch {}
      }

      // 4. Save to local submission history
      const updatedHistory = [newSubmission, ...mySubmissions]
      setMySubmissions(updatedHistory)
      try {
        localStorage.setItem('petpal_feedback_submissions', JSON.stringify(updatedHistory))
      } catch {}

      setSuccessTicket({
        id: ticketId,
        type,
        summary: summary.trim(),
        details: details.trim(),
        emailSent: emailDispatched,
      })

      // Reset form
      setSummary('')
      setDetails('')
      setImageFile(null)
      setImagePreview(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      console.error('Feedback submit error:', err)
      setError(err.message || 'Failed to submit feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const categoryOptions: {
    id: FeedbackType
    title: string
    desc: string
    icon: typeof MessageSquare
    color: string
    bgColor: string
    borderColor: string
    placeholderSummary: string
    placeholderDetails: string
  }[] = [
    {
      id: 'issue',
      title: 'Report an Issue',
      desc: 'Something is broken or behaving unexpectedly',
      icon: AlertCircle,
      color: 'text-error-600',
      bgColor: 'bg-error-50',
      borderColor: 'border-error-200',
      placeholderSummary: 'e.g. Checklists are not marking complete on mobile browser',
      placeholderDetails: 'Please describe the steps to reproduce the issue, your browser version, and any error message you saw...',
    },
    {
      id: 'enhancement',
      title: 'Enhancement Request',
      desc: 'Suggest a feature or improvement',
      icon: Sparkles,
      color: 'text-accent-600',
      bgColor: 'bg-accent-50',
      borderColor: 'border-accent-200',
      placeholderSummary: 'e.g. Add multi-pet weight history graph and printable vaccine summary',
      placeholderDetails: 'Describe how this feature would work and why it would improve your pet care routine...',
    },
    {
      id: 'feedback',
      title: 'General Feedback',
      desc: 'Share your thoughts, suggestions, or praise',
      icon: Heart,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-200',
      placeholderSummary: 'e.g. The new calendar and daily care checklist make pet care so easy!',
      placeholderDetails: 'Share your thoughts, praise, or overall experience with PawCare...',
    },
  ]

  const activeCategory = categoryOptions.find((c) => c.id === type) || categoryOptions[2]

  const filteredHistory = mySubmissions.filter((sub) => {
    if (historyFilter !== 'all' && sub.type !== historyFilter) return false
    return true
  })

  const mailtoUrl = successTicket
    ? `mailto:${targetFeedbackEmail}?subject=${encodeURIComponent(
        `[PawCare ${successTicket.type.toUpperCase()}] ${successTicket.summary} (Ticket #${successTicket.id})`
      )}&body=${encodeURIComponent(
        `Hello PawCare Team,\n\nI have submitted feedback regarding PawCare:\n\nTicket ID: #${successTicket.id}\nCategory: ${successTicket.type}\nSummary: ${successTicket.summary}\nDetails: ${successTicket.details}\nUser: ${profile?.full_name || 'Member'} (${user?.email})\nFamily: ${family?.name || 'N/A'}\n\nSent from PawCare Web App`
      )}`
    : ''

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reach Us & Feedback</h1>
            <span className="badge bg-primary-50 text-primary-700 border border-primary-100 text-xs">
              Direct Support
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            We value your feedback. Let us know how we can make PawCare even better for your family.
          </p>
        </div>

        {mySubmissions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="btn-secondary text-xs self-start sm:self-auto flex items-center gap-1.5 shadow-2xs"
          >
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            {showHistory ? 'Back to Submission Form' : `Your Past Submissions (${mySubmissions.length})`}
          </button>
        )}
      </div>

      {/* Success Banner */}
      {successTicket && !showHistory && (
        <div className="card p-6 border-success-200 bg-gradient-to-r from-success-50/80 via-white to-primary-50/50 relative overflow-hidden shadow-sm animate-fade-in">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-success-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-success-100 text-success-800 border border-success-200/60">
                  Ticket #{successTicket.id}
                </span>
                <span className="text-xs text-gray-400">Received just now</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mt-1">Thank you for your feedback!</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                We've received your submission:{' '}
                <span className="font-semibold text-gray-900">"{successTicket.summary}"</span>.
                {successTicket.emailSent ? (
                  <span className="text-success-700 font-medium">
                    {' '}Notification email has been dispatched to {targetFeedbackEmail}.
                  </span>
                ) : (
                  <span> Our team reviews every submission to improve your pet care experience.</span>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setSuccessTicket(null)}
                  className="btn-primary text-xs py-2 px-3.5 shadow-2xs"
                >
                  Send another message
                </button>
                <a
                  href={mailtoUrl}
                  className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-2xs"
                  title={`Open draft in your email client to ${targetFeedbackEmail}`}
                >
                  <Mail className="w-3.5 h-3.5 text-primary-600" />
                  <span>Forward copy via Email</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSuccessTicket(null)
                    setShowHistory(true)
                  }}
                  className="btn-ghost text-xs py-2 px-3 text-gray-600"
                >
                  View submission history
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {showHistory ? (
        /* Submission History View */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
            <div>
              <h2 className="text-base font-bold text-gray-900">Your Feedback Submissions</h2>
              <p className="text-xs text-gray-500">
                Track status and history of tickets submitted from your account.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              {[
                { id: 'all', label: 'All' },
                { id: 'issue', label: 'Issues' },
                { id: 'enhancement', label: 'Enhancements' },
                { id: 'feedback', label: 'General' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setHistoryFilter(f.id as any)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all',
                    historyFilter === f.id
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="card p-8 text-center space-y-2">
              <Clock className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-sm font-medium text-gray-700">No submissions found</p>
              <p className="text-xs text-gray-400">You haven't submitted any feedback in this category.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((sub) => {
                const cat = categoryOptions.find((c) => c.id === sub.type) || categoryOptions[2]
                const Icon = cat.icon

                return (
                  <div key={sub.id} className="card p-5 border border-gray-100 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className={cn('p-2 rounded-xl mt-0.5', cat.bgColor, cat.color)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-gray-900">{sub.summary}</span>
                            <span
                              className={cn(
                                'badge text-[10px] uppercase font-bold tracking-wider border',
                                cat.bgColor,
                                cat.color,
                                cat.borderColor
                              )}
                            >
                              {sub.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Ticket #{sub.id} • {relativeTime(sub.created_at)} ({formatDate(sub.created_at.split('T')[0])})
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 self-start sm:self-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        Under Review
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 bg-gray-50/80 p-3.5 rounded-xl whitespace-pre-wrap border border-gray-100/60">
                      {sub.details}
                    </p>

                    {sub.image_url && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-gray-400" /> Attached Screenshot:
                        </p>
                        <a
                          href={sub.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block group relative rounded-xl overflow-hidden border border-gray-200"
                        >
                          <img
                            src={sub.image_url}
                            alt="Feedback attachment"
                            className="w-48 h-32 object-cover transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1">
                            View full size <ExternalLink className="w-3.5 h-3.5" />
                          </div>
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Feedback Form View */
        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="card p-6 shadow-sm border border-gray-100 space-y-6">
              {/* Category Selector */}
              <div>
                <label className="label text-xs font-bold uppercase tracking-wider text-gray-700">
                  Select Feedback Category
                </label>
                <div className="grid sm:grid-cols-3 gap-3 mt-1.5">
                  {categoryOptions.map((opt) => {
                    const isSelected = type === opt.id
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setType(opt.id)}
                        className={cn(
                          'p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group cursor-pointer',
                          isSelected
                            ? cn(opt.bgColor, opt.borderColor, 'ring-2 ring-primary-500/50 shadow-xs')
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className={cn('p-2.5 rounded-xl transition-colors', opt.bgColor, opt.color)}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                              isSelected
                                ? 'border-primary-600 bg-primary-600'
                                : 'border-gray-300 bg-white group-hover:border-gray-400'
                            )}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                        <div>
                          <p className="font-bold text-sm text-gray-900">{opt.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Summary / Title */}
              <div>
                <label className="label text-xs font-bold uppercase tracking-wider text-gray-700">
                  Summary / Title <span className="text-error-500">*</span>
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={activeCategory.placeholderSummary}
                  className="input text-sm"
                  required
                />
              </div>

              {/* Details Textarea */}
              <div>
                <label className="label text-xs font-bold uppercase tracking-wider text-gray-700">
                  Detailed Explanation <span className="text-error-500">*</span>
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={5}
                  placeholder={activeCategory.placeholderDetails}
                  className="input text-sm leading-relaxed"
                  required
                />
              </div>

              {/* Image / Screenshot Upload with Drag & Paste */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label text-xs font-bold uppercase tracking-wider text-gray-700 mb-0">
                    Screenshot or Image Attachment (Optional)
                  </label>
                  <span className="text-[11px] text-gray-400">
                    Tip: Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono text-[10px]">Cmd+V</kbd> to paste screenshot
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  className="hidden"
                />

                {!imagePreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 hover:border-primary-400 hover:bg-primary-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all group"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-primary-100 text-gray-500 group-hover:text-primary-600 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-gray-800">
                      Click to upload an image or drag & drop here
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Supports PNG, JPG, WEBP, or GIF up to 5MB
                    </p>
                  </div>
                ) : (
                  <div className="relative rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 p-2 shadow-2xs">
                    <div className="flex items-center justify-between p-2 bg-white rounded-xl shadow-2xs mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ImageIcon className="w-4 h-4 text-primary-600 shrink-0" />
                        <span className="text-xs font-medium text-gray-700 truncate">
                          {imageFile?.name || 'Pasted Screenshot'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-1 rounded-lg text-gray-400 hover:text-error-600 hover:bg-error-50 transition-colors"
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="max-h-60 overflow-hidden rounded-xl bg-black/5 flex items-center justify-center">
                      <img
                        src={imagePreview}
                        alt="Feedback attachment preview"
                        className="max-h-60 w-auto object-contain rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-error-50 text-error-700 text-xs border border-error-200 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || uploadingImage}
                  className="btn-primary w-full py-3 text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  {submitting || uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{uploadingImage ? 'Uploading screenshot...' : 'Submitting feedback...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Feedback Ticket</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Sidebar: Contact Info & Support FAQ */}
          <div className="space-y-4">
            {/* Account Info Box */}
            <div className="card p-5 space-y-3 shadow-xs border border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Your Contact Info</h3>
              <div className="p-3 bg-gray-50 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-semibold text-gray-900">{profile?.full_name || 'PawCare Member'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email:</span>
                  <span className="font-semibold text-gray-900 truncate max-w-[170px]">{user?.email || 'N/A'}</span>
                </div>
                {family && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Family:</span>
                    <span className="font-semibold text-gray-900 truncate max-w-[170px]">{family.name}</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400 leading-normal">
                Follow-ups or status updates will be sent to your registered email address.
              </p>
            </div>

            {/* Support Destination Box */}
            <div className="card p-5 space-y-2.5 shadow-xs border border-gray-100">
              <div className="flex items-center gap-2 text-primary-700">
                <Mail className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-bold text-gray-900">Direct Support Inbox</h3>
              </div>
              <p className="text-xs text-gray-600">
                Feedback reports are monitored directly by the product team at:
              </p>
              <div className="p-2.5 bg-primary-50/70 rounded-xl border border-primary-100 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-primary-900 truncate">
                  {targetFeedbackEmail}
                </span>
                <a
                  href={`mailto:${targetFeedbackEmail}`}
                  className="text-xs text-primary-700 hover:underline shrink-0 font-semibold"
                >
                  Direct Email
                </a>
              </div>
            </div>

            {/* Quick Tips Box */}
            <div className="card p-5 space-y-3 shadow-xs border border-gray-100">
              <div className="flex items-center gap-2 text-primary-700">
                <HelpCircle className="w-4 h-4 text-primary-600" />
                <h3 className="text-sm font-bold text-gray-900">Frequently Asked Questions</h3>
              </div>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100/60">
                  <p className="font-bold text-gray-800">Family Invitations</p>
                  <p className="mt-0.5 text-gray-500">
                    Invite family members by email on the Family tab. They will receive access immediately.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100/60">
                  <p className="font-bold text-gray-800">AI Checklists & Routines</p>
                  <p className="mt-0.5 text-gray-500">
                    Generate tailored feeding, grooming, and medical routines powered by Gemini AI inside any pet profile.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100/60">
                  <p className="font-bold text-gray-800">Care Calendar</p>
                  <p className="mt-0.5 text-gray-500">
                    Track upcoming vet checkups, vaccinations, and export events to Google Calendar.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

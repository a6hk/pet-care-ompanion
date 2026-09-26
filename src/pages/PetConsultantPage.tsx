import { useState, useEffect, useRef } from 'react'
import { useFamily } from '@/context/FamilyContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Send, Bot, User, Trash2, Copy, Check,
  AlertTriangle, ArrowRight, Calendar, CheckSquare,
  ShieldCheck, HelpCircle, RefreshCw, PawPrint, Key, ExternalLink
} from 'lucide-react'
import { Modal } from '@/components/Modal'
import { FormattedAIResponse } from '@/components/FormattedAIResponse'
import { getPetConsultantResponse, type ChatMessage } from '@/lib/petConsultantAI'
import { getGeminiApiKey, setGeminiApiKey, hasGeminiApiKey } from '@/lib/gemini'
import { speciesIcon, cn } from '@/lib/utils'
import type { Pet } from '@/types'

const QUICK_STARTERS = [
  {
    icon: '🐕',
    title: 'Dog Adoption Guide',
    query: 'I want to adopt a dog. What do I need to know, prepare, and budget for?',
  },
  {
    icon: '🩺',
    title: 'Symptom Triage',
    query: 'My pet is lethargic and not eating today. What should I check and monitor?',
  },
  {
    icon: '🍎',
    title: 'Toxic & Safe Foods',
    query: 'What human foods are safe for dogs and cats, and which foods are strictly toxic?',
  },
  {
    icon: '🎾',
    title: 'Potty & Crate Training',
    query: 'What is the most effective step-by-step method for puppy potty and crate training?',
  },
  {
    icon: '🐱',
    title: 'Cat Care & Socialization',
    query: 'How do I safely introduce a new kitten or cat to an adult resident cat?',
  },
]

export function PetConsultantPage() {
  const { family } = useFamily()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [pets, setPets] = useState<Pet[]>([])
  const [selectedPetId, setSelectedPetId] = useState<string>('all')
  const [inputQuery, setInputQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Gemini API Key State
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState(() => getGeminiApiKey())
  const [hasApiKey, setHasApiKey] = useState(() => hasGeminiApiKey())

  function handleSaveApiKey() {
    setGeminiApiKey(apiKeyInput)
    setHasApiKey(hasGeminiApiKey())
    setShowKeyModal(false)
  }

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('petpal_consultant_chat')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [
      {
        id: 'initial_welcome',
        role: 'assistant',
        content: `👋 **Hello! I'm your AI Pet Care Consultant.**

I specialize in animal wellness, adoption preparation, symptom triage, nutrition, and positive reinforcement behavior training.

You can ask me questions such as:
* *"I want to adopt a dog — what do I need to know and prepare?"*
* *"Describe symptoms: my pet is lethargic and vomiting — what should I do?"*
* *"Is peanut butter or avocado safe for dogs?"*
* *"How can I help my rescue pet settle in during the first week?"*

Choose one of your registered pets above to get personalized advice, or click any starter topic below to begin!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        category: 'general',
      },
    ]
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load family pets
  useEffect(() => {
    async function loadPets() {
      if (!family) return
      const { data } = await supabase
        .from('pets')
        .select('*')
        .eq('family_id', family.id)
        .order('name', { ascending: true })
      setPets((data as Pet[]) ?? [])
    }
    loadPets()
  }, [family])

  // Save chat history
  useEffect(() => {
    try {
      localStorage.setItem('petpal_consultant_chat', JSON.stringify(messages))
    } catch {}
  }, [messages])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const activePet = pets.find((p) => p.id === selectedPetId) || null

  async function handleSendMessage(queryToSend?: string) {
    const q = (queryToSend || inputQuery).trim()
    if (!q || loading) return

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!queryToSend) setInputQuery('')
    setLoading(true)

    try {
      const aiResponse = await getPetConsultantResponse(q, activePet, pets, messages)
      const assistantMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: aiResponse.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        category: aiResponse.category,
        isEmergency: aiResponse.isEmergency,
        suggestedActions: aiResponse.suggestedActions,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: 'I apologize, but I encountered an issue processing your consultation. Please try asking again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  function handleClearChat() {
    if (confirm('Clear your conversation history with the Pet Consultant?')) {
      const initial: ChatMessage[] = [
        {
          id: `welcome_${Date.now()}`,
          role: 'assistant',
          content: `👋 **Chat reset.** I'm ready to answer any questions about pet adoption, symptoms, diet, and training!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          category: 'general',
        },
      ]
      setMessages(initial)
      localStorage.removeItem('petpal_consultant_chat')
    }
  }

  function handleCopyContent(id: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleActionClick(action: { actionType: string; payload?: string }) {
    if (action.actionType === 'navigate_calendar') {
      navigate('/app/calendar')
    } else if (action.actionType === 'navigate_checklist') {
      navigate('/app/checklists')
    } else if (action.actionType === 'prompt' && action.payload) {
      handleSendMessage(action.payload)
    }
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto flex flex-col h-[calc(100vh-6.5rem)] lg:h-[calc(100vh-4rem)]">
      {/* Consultant Header Banner */}
      <div className="card p-4 sm:p-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-primary-900 text-white shadow-md border-0 relative overflow-hidden shrink-0">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-400 p-0.5 shadow-md flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Pet Care Consultant AI
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-400/20 text-purple-200 border border-purple-400/30 text-[10px] font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Expert Advisor
                </span>
              </div>
              <p className="text-xs text-purple-100/80 mt-0.5">
                Specialized in adoption guidance, symptom triage, behavior, and nutrition
              </p>
            </div>
          </div>

          {/* Chat Controls & Key Status */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => {
                setApiKeyInput(getGeminiApiKey())
                setShowKeyModal(true)
              }}
              className={cn(
                "px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border shadow-xs",
                hasApiKey
                  ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30"
                  : "bg-amber-500/20 text-amber-200 border-amber-400/40 hover:bg-amber-500/30"
              )}
              title="Configure Gemini API Key"
            >
              <Key className="w-3.5 h-3.5" />
              <span>{hasApiKey ? 'Gemini 2.5 Flash' : 'Connect Gemini Key'}</span>
            </button>
            <button
              onClick={handleClearChat}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-purple-100 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all border border-white/10"
              title="Clear chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Context Pet Selector Bar */}
      {pets.length > 0 && (
        <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-gray-100 shadow-2xs overflow-x-auto shrink-0">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5">
            <PawPrint className="w-3.5 h-3.5 text-primary-600" />
            Consulting For:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedPetId('all')}
              className={cn(
                'px-3 py-1 rounded-xl text-xs font-semibold transition-all whitespace-nowrap',
                selectedPetId === 'all'
                  ? 'bg-primary-600 text-white shadow-2xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              🐾 General Advice
            </button>
            {pets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPetId(p.id)}
                className={cn(
                  'px-3 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap',
                  selectedPetId === p.id
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                <span>{speciesIcon(p.species)}</span>
                <span>{p.name}</span>
                {p.breed && <span className="opacity-75 text-[10px]">({p.breed})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Feed */}
      <div className="flex-1 card p-4 sm:p-5 overflow-y-auto space-y-4 shadow-sm bg-white/70 backdrop-blur-sm border-gray-100">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-3 max-w-3xl animate-fade-in',
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center text-xs shrink-0 shadow-2xs',
                msg.role === 'user'
                  ? 'bg-primary-600 text-white'
                  : msg.isEmergency
                  ? 'bg-rose-600 text-white'
                  : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
              )}
            >
              {msg.role === 'user' ? (
                user?.email?.[0]?.toUpperCase() || <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>

            {/* Bubble */}
            <div
              className={cn(
                'rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-2xs group relative',
                msg.role === 'user'
                  ? 'bg-primary-600 text-white rounded-tr-none'
                  : msg.isEmergency
                  ? 'bg-rose-50/90 text-rose-950 border border-rose-200 rounded-tl-none ring-2 ring-rose-300/40'
                  : 'bg-gray-50/90 text-gray-800 border border-gray-100 rounded-tl-none'
              )}
            >
              {/* Header meta */}
              <div className="flex items-center justify-between gap-3 mb-1.5 opacity-80 text-[10px]">
                <span className="font-bold uppercase tracking-wider">
                  {msg.role === 'user' ? 'You' : 'Pet Care Consultant'}
                </span>
                <div className="flex items-center gap-1.5">
                  <span>{msg.timestamp}</span>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => handleCopyContent(msg.id, msg.content)}
                      className="p-1 rounded hover:bg-black/5 text-gray-500 transition-colors"
                      title="Copy advice"
                    >
                      {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Message Content with Rich Markdown Formatting */}
              {msg.role === 'assistant' ? (
                <FormattedAIResponse
                  content={msg.content}
                  isEmergency={msg.isEmergency}
                />
              ) : (
                <div className="whitespace-pre-wrap font-normal">
                  {msg.content}
                </div>
              )}

              {/* Action buttons if assistant recommended actions */}
              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-gray-200/50 flex flex-wrap gap-1.5">
                  {msg.suggestedActions.map((act, i) => (
                    <button
                      key={i}
                      onClick={() => handleActionClick(act)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-purple-300 hover:bg-purple-50 text-purple-900 transition-all shadow-2xs flex items-center gap-1"
                    >
                      <span>{act.label}</span>
                      <ArrowRight className="w-3 h-3 opacity-60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 max-w-xl animate-fade-in">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100 rounded-tl-none flex items-center gap-2 text-xs text-gray-500">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600" />
              <span>Pet Consultant is analyzing medical and behavioral records...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Topic Suggestions */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 shrink-0">
        {QUICK_STARTERS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(s.query)}
            className="px-3 py-1.5 rounded-xl bg-white border border-gray-200/80 hover:border-purple-300 hover:bg-purple-50/50 text-xs font-medium text-gray-700 whitespace-nowrap shadow-2xs transition-all flex items-center gap-1.5"
          >
            <span>{s.icon}</span>
            <span>{s.title}</span>
          </button>
        ))}
      </div>

      {/* Input Form & Medical Disclaimer */}
      <div className="space-y-1.5 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSendMessage()
          }}
          className="relative flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-200 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 shadow-sm transition-all"
        >
          <textarea
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activePet
                ? `Ask about ${activePet.name}'s symptoms, nutrition, behavior, or care...`
                : 'Ask anything: adoption prep, symptom triage, nutrition, training tips...'
            }
            className="flex-1 max-h-32 min-h-[44px] p-2 text-xs sm:text-sm bg-transparent border-0 focus:ring-0 focus:outline-hidden resize-none leading-relaxed"
            rows={1}
          />
          <button
            type="submit"
            disabled={loading || !inputQuery.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-40 disabled:pointer-events-none shadow-sm transition-all shrink-0 cursor-pointer"
            title="Send query"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <p className="text-[10px] text-center text-gray-400 leading-tight">
          ⚡ Powered by Google Gemini 2.5 Flash • ⚠️ <strong>Veterinary Disclaimer:</strong> PetPal AI Consultant provides educational animal care guidance. For severe distress, suspected poisoning, or medical emergencies, consult a licensed veterinarian or emergency clinic immediately.
        </p>
      </div>

      {/* Gemini API Key Configuration Modal */}
      <Modal
        open={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        title="Google Gemini AI Settings"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-100 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-900 space-y-1">
              <p className="font-bold">Powered by Gemini 2.5 Flash</p>
              <p className="text-purple-700 leading-relaxed">
                Connect your Google Gemini API key to enable high-speed veterinary triage, custom checklists, and conversational consultations across all of PetPal.
              </p>
            </div>
          </div>

          <div>
            <label className="label text-xs font-bold text-gray-700 uppercase">
              Gemini API Key
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="input text-sm font-mono"
            />
            <p className="text-[11px] text-gray-500 mt-1.5 flex items-center justify-between">
              <span>You can also set <code>VITE_GEMINI_API_KEY</code> in your <code>.env</code> file.</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 hover:text-primary-700 font-semibold inline-flex items-center gap-1 shrink-0"
              >
                <span>Get Free Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowKeyModal(false)}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveApiKey}
              className="btn-primary text-xs"
            >
              Save Key
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

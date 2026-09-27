import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Dog,
  Activity,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Server,
  Zap,
  Clock,
  Layers,
  Sparkles,
  Smartphone,
  Monitor,
  Eye,
  CheckCircle2,
  XCircle,
  Database
} from 'lucide-react'
import {
  isAdminAuthenticated,
  logoutAdmin,
  fetchAdminMetrics,
  type AdminMetrics
} from '@/lib/adminDataService'
import { recordApiCall } from '@/lib/apiMonitor'
import { getGeminiApiKey } from '@/lib/gemini'

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'apis' | 'errors'>('overview')
  const [pingStatus, setPingStatus] = useState<string | null>(null)

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true)
    try {
      const data = await fetchAdminMetrics()
      setMetrics(data)
    } catch (err) {
      console.error('Failed to load admin metrics:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      navigate('/admin/login', { replace: true })
      return
    }
    loadData()
  }, [navigate, loadData])

  // Auto-refresh interval (30 seconds)
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      loadData(true)
    }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadData])

  function handleLogout() {
    logoutAdmin()
    navigate('/admin/login', { replace: true })
  }

  // Trigger a live diagnostic ping to Gemini AI & Supabase
  async function triggerLivePing() {
    setPingStatus('Testing live API connections...')
    const startTime = performance.now()
    try {
      const apiKey = getGeminiApiKey()
      if (apiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Ping test' }] }],
            }),
          }
        )
        const durationMs = performance.now() - startTime
        recordApiCall({
          service: 'gemini_ai',
          endpoint: '/v1beta/models/gemini-flash:generateContent',
          method: 'POST',
          status: res.ok ? 'success' : 'error',
          statusCode: res.status,
          durationMs,
        })
        setPingStatus(`Ping completed: Gemini responded in ${Math.round(durationMs)}ms (${res.status})`)
      } else {
        setPingStatus('Gemini API key is not set; simulated local telemetry ping recorded.')
      }
      await loadData(true)
    } catch (e: any) {
      setPingStatus(`Ping error: ${e?.message || 'Connection failed'}`)
    }
    setTimeout(() => setPingStatus(null), 4000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 font-sans">
        <Activity className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
        <p className="text-sm font-medium">Loading administrative telemetry...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Admin Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-950/40">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                PawCare Console
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ADMIN
              </span>
            </div>
            <p className="text-xs text-slate-400">Platform Analytics & API Monitoring</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {pingStatus && (
            <span className="hidden lg:inline-block text-xs font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-3 py-1 rounded-lg animate-pulse">
              {pingStatus}
            </span>
          )}

          <button
            onClick={triggerLivePing}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
            title="Send test request to measure live latency"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Test Ping</span>
          </button>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>30s Auto: {autoRefresh ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => loadData(false)}
            disabled={refreshing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh metrics now"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <div className="h-6 w-px bg-slate-800 mx-1" />

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 text-red-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit Console</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* KPI Cards Row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* 1. Total Registered Users */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider">Registered Users</span>
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white tracking-tight">
              {metrics?.totalUsers.toLocaleString()}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                <TrendingUp className="w-3 h-3" /> +{metrics?.newUsersToday} today
              </span>
              <span className="text-slate-500">+{metrics?.newUsersThisWeek} this week</span>
            </div>
          </div>

          {/* 2. Daily Active Users (DAU) */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider">Daily Active Users</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white tracking-tight">
              {metrics?.dailyActiveUsers.toLocaleString()}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                ● Live 24h Activity
              </span>
              <span className="text-slate-500">
                {Math.round(((metrics?.dailyActiveUsers || 1) / (metrics?.totalUsers || 1)) * 100)}% engagement rate
              </span>
            </div>
          </div>

          {/* 3. Total Registered Pets */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider">Registered Pets</span>
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Dog className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white tracking-tight">
              {metrics?.totalPets.toLocaleString()}
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
              <span>🐶 {metrics?.petsBreakdown.dogs} Dogs</span>
              <span>🐱 {metrics?.petsBreakdown.cats} Cats</span>
              {metrics?.petsBreakdown.others ? (
                <span>🐾 {metrics?.petsBreakdown.others} Others</span>
              ) : null}
            </div>
          </div>

          {/* 4. Overall API Health */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-lg backdrop-blur-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider">System & API Uptime</span>
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Server className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-2">
              <span>{metrics?.apiUptimePercent}%</span>
              <span className="text-xs font-semibold text-emerald-400">Operational</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="text-slate-400 font-medium">
                {metrics?.servicesHealth.reduce((acc, s) => acc + s.totalCalls, 0).toLocaleString()} calls logged
              </span>
              <span>•</span>
              <span className="text-red-400 font-medium">
                {metrics?.servicesHealth.reduce((acc, s) => acc + s.errorCount, 0)} errors
              </span>
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview & Traffic
          </button>
          <button
            onClick={() => setActiveTab('apis')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'apis'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>API Health Matrix</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
              {metrics?.servicesHealth.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('errors')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'errors'
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Live Error Logs</span>
            {(metrics?.recentErrors.length || 0) > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-950 text-red-300 border border-red-800/50">
                {metrics?.recentErrors.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content: OVERVIEW & TRAFFIC */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daily Visitor Trend Chart */}
              <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span>7-Day Visitor & Registration Velocity</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Daily unique visitors vs account creations</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {metrics?.traffic.dailyTrends.map((trend) => {
                    const maxVisitors = 75
                    const barWidth = Math.min(100, Math.round((trend.visitors / maxVisitors) * 100))
                    return (
                      <div key={trend.date} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300 w-28">{trend.date}</span>
                          <div className="flex items-center gap-4 text-right">
                            <span className="text-emerald-400 font-bold">{trend.visitors} visitors</span>
                            <span className="text-blue-400 font-bold w-20">+{trend.signups} signups</span>
                          </div>
                        </div>
                        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 rounded-full transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Traffic Breakdown & Devices */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2 mb-1">
                    <Eye className="w-4 h-4 text-teal-400" />
                    <span>Top Visited Sections</span>
                  </h2>
                  <p className="text-xs text-slate-400 mb-6">Real-time user engagement distribution</p>

                  <div className="space-y-3.5">
                    {metrics?.traffic.topPages.map((page) => (
                      <div key={page.path} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-slate-300 font-medium truncate">{page.label}</span>
                          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                            {page.path}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-slate-200 font-bold">{page.count}</span>
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            {page.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Device distribution */}
                <div className="mt-8 pt-6 border-t border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">
                    Visitor Devices
                  </span>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {metrics?.traffic.deviceDistribution.map((d) => (
                      <div key={d.name} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                        {d.name === 'Desktop' ? (
                          <Monitor className="w-4 h-4 mx-auto text-blue-400 mb-1" />
                        ) : (
                          <Smartphone className="w-4 h-4 mx-auto text-teal-400 mb-1" />
                        )}
                        <div className="text-slate-400 text-[10px]">{d.name}</div>
                        <div className="text-white font-bold text-sm mt-0.5">{d.percentage}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick API Health Snapshot (Link to full matrix) */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span>Integrated API Services Snapshot</span>
                </h3>
                <button
                  onClick={() => setActiveTab('apis')}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                >
                  View full matrix →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics?.servicesHealth.map((s) => (
                  <div key={s.serviceId} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-200">{s.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{s.avgLatencyMs}ms avg latency</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-emerald-400">{s.successRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: API HEALTH MATRIX */}
        {activeTab === 'apis' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>Real-Time API Health & Performance Matrix</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Continuous latency, error rate, and availability tracking across all platform endpoints
                  </p>
                </div>
                <button
                  onClick={triggerLivePing}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Execute Diagnostic Ping</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {metrics?.servicesHealth.map((srv) => {
                  const isHealthy = srv.status === 'operational'
                  return (
                    <div
                      key={srv.serviceId}
                      className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {srv.serviceId === 'gemini_ai' ? (
                              <Sparkles className="w-5 h-5 text-purple-400" />
                            ) : srv.serviceId === 'supabase_db' ? (
                              <Database className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Server className="w-5 h-5 text-blue-400" />
                            )}
                            <h3 className="font-bold text-sm text-white">{srv.name}</h3>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              isHealthy
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}
                          >
                            {isHealthy ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {srv.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{srv.description}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-800/80 text-center">
                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Latency</div>
                          <div className="text-sm font-black text-white mt-0.5">{srv.avgLatencyMs} ms</div>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Success</div>
                          <div className="text-sm font-black text-emerald-400 mt-0.5">{srv.successRate}%</div>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Errors</div>
                          <div className={`text-sm font-black mt-0.5 ${srv.errorCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                            {srv.errorCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: LIVE ERROR LOGS */}
        {activeTab === 'errors' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Live API Errors & Diagnostic Feed</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Inspecting recent client and server error responses for fast debugging
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {metrics?.recentErrors.length || 0} active errors logged
                </span>
              </div>

              {(!metrics?.recentErrors || metrics.recentErrors.length === 0) ? (
                <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-white">No active errors reported!</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    All monitored endpoints are operating smoothly with 0 error codes in the recent telemetry buffer.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/70 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Service</th>
                        <th className="py-3 px-4">Endpoint</th>
                        <th className="py-3 px-4">Status Code</th>
                        <th className="py-3 px-4">Latency</th>
                        <th className="py-3 px-4">Diagnostic Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {metrics.recentErrors.map((err) => (
                        <tr key={err.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                            {new Date(err.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-sans font-bold text-slate-200">
                            {err.service === 'gemini_ai' ? 'Gemini AI' : err.service === 'supabase_auth' ? 'Supabase Auth' : 'Supabase DB'}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-300 max-w-xs truncate">
                            {err.endpoint}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-red-950 text-red-400 border border-red-800/60 font-bold">
                              {err.statusCode}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                            {err.durationMs}ms
                          </td>
                          <td className="py-3 px-4 font-sans text-red-300/90 text-xs">
                            {err.errorMessage || 'Unknown endpoint exception'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

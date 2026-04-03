import { useEffect, useState, useRef } from "react"
import { io } from "socket.io-client"

const API = import.meta.env.VITE_API_URL
const socket = io(API, { transports: ["websocket", "polling"] })

const CLIENTS = ["Acme Corp", "TechCo Inc", "RetailMart", "Warehouse LLC", "FinServ Group"]

const PROGRESS_BAR_COLOR = {
  running:   "bg-blue-500",
  completed: "bg-green-500",
  failed:    "bg-red-500",
  cancelled: "bg-gray-500",
  queued:    "bg-yellow-500/50",
}

function StatusBadge({ status }) {
  const styles = {
    completed: "text-green-400 bg-green-500/10",
    running:   "text-blue-400 bg-blue-500/10",
    failed:    "text-red-400 bg-red-500/10",
    queued:    "text-yellow-400 bg-yellow-500/10",
    cancelled: "text-gray-400 bg-gray-500/10",
  }
  const dots = {
    completed: "bg-green-400",
    running:   "bg-blue-400",
    failed:    "bg-red-400",
    queued:    "bg-yellow-400",
    cancelled: "bg-gray-500",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "text-gray-400 bg-gray-500/10"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] ?? "bg-gray-500"} ${status === "running" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  )
}

function ProgressBar({ value, status }) {
  const color = PROGRESS_BAR_COLOR[status] ?? "bg-blue-500"
  const isRunning = status === "running"
  return (
    <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
      <div
        className={`${color} h-2 rounded-full transition-all duration-500 ${isRunning ? "relative" : ""}`}
        style={{ width: `${value}%` }}
      >
        {isRunning && value > 0 && (
          <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, icon, active, filter, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-gray-900 rounded-xl border p-4 text-left transition-all w-full
        ${active
          ? "border-blue-500/60 ring-1 ring-blue-500/20 shadow-lg shadow-blue-500/5"
          : "border-gray-800 hover:border-gray-600"
        }`}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {active && filter !== null && (
        <p className="text-blue-400 text-xs mt-2">Filtered · click to clear</p>
      )}
    </button>
  )
}

function Toast({ toasts, onDismiss }) {
  return (
    <div className="fixed top-6 right-6 flex flex-col gap-2 z-50">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium cursor-pointer
            ${toast.type === "failed"
              ? "bg-red-900/90 border-red-500/50 text-red-200"
              : "bg-green-900/90 border-green-500/50 text-green-200"
            }`}
          onClick={() => onDismiss(toast.id)}
        >
          <span>{toast.type === "failed" ? "✕" : "✓"}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

function JobModal({ job, onClose }) {
  if (!job) return null
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-white font-mono">{job.job_name}</h2>
            <p className="text-gray-500 text-xs mt-1 font-mono">{job.job_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg">✕</button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Progress</span>
              <span>{job.progress}%</span>
            </div>
            <ProgressBar value={job.progress} status={job.status} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Client", value: job.client },
              { label: "Triggered By", value: job.triggered_by || "—" },
              { label: "Duration", value: job.duration ? `${job.duration}s` : "—" },
              { label: "Retries", value: `${job.retry_count} / ${job.max_retries}` },
              { label: "Started", value: job.start_time ? new Date(job.start_time + "Z").toLocaleTimeString() : "—" },
              { label: "Ended", value: job.end_time ? new Date(job.end_time + "Z").toLocaleTimeString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800/50 rounded-lg p-3">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</p>
                <p className="text-white text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>
          {job.error_message && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-xs uppercase tracking-wider mb-2 font-medium">Error</p>
              <p className="text-red-300 text-sm">{job.error_message}</p>
              {job.error_type && <p className="text-red-500 text-xs mt-1 font-mono">{job.error_type}</p>}
            </div>
          )}
          {job.logs && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Logs</p>
              <pre className="bg-gray-950 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono">
                {job.logs || "No logs available"}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TasksTab({ addToast }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionInFlight, setActionInFlight] = useState(null)

  useEffect(() => {
    fetch(`${API}/tasks`)
      .then(r => r.json())
      .then(data => { setTasks(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleStart = async (task) => {
    setActionInFlight(task.task_id + "-start")
    try {
      const res = await fetch(`${API}/tasks/${task.task_id}/start`, { method: "POST" })
      if (res.ok) addToast(`${task.name} queued`, "completed")
      else addToast(`Failed to start ${task.name}`, "failed")
    } catch {
      addToast(`Failed to start ${task.name}`, "failed")
    }
    setActionInFlight(null)
  }

  const handleToggleEnabled = async (task) => {
    const updated = !task.enabled
    setTasks(prev => prev.map(t => t.task_id === task.task_id ? { ...t, enabled: updated } : t))
    try {
      await fetch(`${API}/tasks/${task.task_id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: updated }),
      })
    } catch {
      setTasks(prev => prev.map(t => t.task_id === task.task_id ? { ...t, enabled: !updated } : t))
      addToast(`Failed to update ${task.name}`, "failed")
    }
  }

  const SCHEDULE_COLORS = {
    daily:   "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    weekly:  "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    monthly: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-500 text-sm">Loading tasks...</div>
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-gray-400 text-xs uppercase tracking-wider">{tasks.length} tasks defined</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3">Task</th>
            <th className="text-left px-4 py-3">Schedule</th>
            <th className="text-left px-4 py-3">Window</th>
            <th className="text-left px-4 py-3">Duration</th>
            <th className="text-left px-4 py-3">Prerequisite</th>
            <th className="text-left px-4 py-3">Enabled</th>
            <th className="text-left px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => {
            const prereq = task.prerequisite_task_id
              ? tasks.find(t => t.task_id === task.prerequisite_task_id)
              : null
            return (
              <tr key={task.task_id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono font-semibold text-white text-xs tracking-wide">{task.name}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{task.description}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${SCHEDULE_COLORS[task.schedule] ?? "bg-gray-500/20 text-gray-400"}`}>
                    {task.schedule}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300 font-mono text-xs">{task.scheduled_time}</td>
                <td className="px-4 py-3 text-gray-300 text-xs">{task.duration_min}–{task.duration_max}s</td>
                <td className="px-4 py-3 text-xs">
                  {prereq
                    ? <span className="font-mono text-yellow-400/80 text-xs">{prereq.name}</span>
                    : <span className="text-gray-600">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleEnabled(task)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                      ${task.enabled ? "bg-blue-500" : "bg-gray-700"}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                      ${task.enabled ? "translate-x-4" : "translate-x-1"}`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleStart(task)}
                    disabled={!task.enabled || actionInFlight === task.task_id + "-start"}
                    className="px-2.5 py-1 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-600/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    {actionInFlight === task.task_id + "-start" ? "..." : "Start"}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function JobRow({ job, selected, onClick, onCancel, queuePos, estimateStart }) {
  const [flash, setFlash] = useState(false)
  const prevStatus = useRef(job.status)

  useEffect(() => {
    if (prevStatus.current !== job.status) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 800)
      prevStatus.current = job.status
      return () => clearTimeout(t)
    }
  }, [job.status])

  return (
    <tr
      onClick={onClick}
      className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-all duration-300 cursor-pointer
        ${selected ? "bg-gray-800/60 ring-1 ring-inset ring-blue-500/30" : ""}
        ${flash ? "bg-gray-700/60" : ""}
      `}
    >
      <td className="px-4 py-3">
        <div className="font-mono font-semibold text-white text-xs tracking-wide">{job.job_name}</div>
        <div className="text-gray-600 text-xs mt-0.5 font-mono">{job.job_id}</div>
        {job.status === "queued" && queuePos && (
          <div className="text-yellow-500/70 text-xs mt-0.5">
            Queue #{queuePos} · {estimateStart(queuePos)}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs">{job.client}</td>
      <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ProgressBar value={job.progress} status={job.status} />
          <span className="text-gray-500 text-xs w-8 text-right">{job.progress}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs">{job.duration ? `${job.duration}s` : "—"}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">
        {job.start_time ? new Date(job.start_time + "Z").toLocaleTimeString() : "—"}
      </td>
      <td className="px-4 py-3">
        {(job.status === "running" || job.status === "queued") && (
          <button
            onClick={e => { e.stopPropagation(); onCancel() }}
            className="px-2.5 py-1 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded hover:bg-red-600/40 transition-colors"
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  )
}

export default function App() {
  const [tab, setTab] = useState("jobs")
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [globalRunning, setGlobalRunning] = useState(0)
  const [globalFailed, setGlobalFailed] = useState(0)
  const [globalCompleted, setGlobalCompleted] = useState(0)
  const [globalCancelled, setGlobalCancelled] = useState(0)
  const [statusFilter, setStatusFilter] = useState(null)
  const [clientFilter, setClientFilter] = useState("")
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [toasts, setToasts] = useState([])
  const [connected, setConnected] = useState(false)
  const previousStatuses = useRef({})
  const avgDuration = useRef(120)

  const addToast = (message, type) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const fetchPage = (p, status, client) => {
    const params = new URLSearchParams({ page: p, limit: 20 })
    if (status) params.set("status", status)
    if (client) params.set("client", client)
    fetch(`${API}/jobs?${params}`)
      .then(r => r.json())
      .then(data => {
        setJobs(data.jobs)
        setTotalPages(data.pages)
        setTotalCount(data.total)
        setFilteredTotal(data.filtered_total ?? data.total)
        setGlobalRunning(data.running)
        setGlobalFailed(data.failed)
        setGlobalCompleted(data.completed)
        setGlobalCancelled(data.cancelled ?? 0)
        const snapshot = {}
        data.jobs.forEach(j => { snapshot[j.job_id] = j.status })
        previousStatuses.current = snapshot
        const completed = data.jobs.filter(j => j.status === "completed" && j.duration)
        if (completed.length > 0) {
          avgDuration.current = completed.reduce((s, j) => s + j.duration, 0) / completed.length
        }
      })
      .catch(() => setError("Could not reach backend"))
  }

  const fetchJobDetail = (jobId) => {
    fetch(`${API}/jobs/${jobId}`)
      .then(r => r.json())
      .then(data => setSelectedJob(data))
      .catch(() => {})
  }

  const handleCancelJob = async (jobId, jobName) => {
    try {
      await fetch(`${API}/jobs/${jobId}/cancel`, { method: "POST" })
      addToast(`${jobName} cancelled`, "completed")
    } catch {
      addToast(`Failed to cancel ${jobName}`, "failed")
    }
  }

  const handleStatClick = (filter) => {
    const newFilter = statusFilter === filter ? null : filter
    setStatusFilter(newFilter)
    setPage(1)
    fetchPage(1, newFilter, clientFilter)
  }

  const handleClientChange = (client) => {
    setClientFilter(client)
    setPage(1)
    fetchPage(1, statusFilter, client)
  }

  useEffect(() => { fetchPage(page, statusFilter, clientFilter) }, [page])

  useEffect(() => {
    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))
    socket.on("job_update", (update) => {
      const { job_id, status, progress } = update
      const prev = previousStatuses.current[job_id]
      if (prev === "running" && status === "failed") {
        setJobs(current => {
          const job = current.find(j => j.job_id === job_id)
          if (job) addToast(`${job.job_name} failed`, "failed")
          return current
        })
      } else if (prev === "running" && status === "completed") {
        setJobs(current => {
          const job = current.find(j => j.job_id === job_id)
          if (job) addToast(`${job.job_name} completed`, "completed")
          return current
        })
      }
      previousStatuses.current[job_id] = status
      setJobs(current => {
        const exists = current.some(j => j.job_id === update.job_id)
        if (!exists && update.status === 'queued') {
          return [update, ...current]
        }
        return current.map(j => j.job_id === job_id ? { ...j, status, progress } : j)
      })
      if (selectedJobId === job_id) {
        setSelectedJob(prev => prev ? { ...prev, status, progress } : prev)
      }
    })
    socket.on("stats_update", (stats) => {
      setTotalCount(stats.total)
      setGlobalRunning(stats.running)
      setGlobalFailed(stats.failed)
      setGlobalCompleted(stats.completed)
      setGlobalCancelled(stats.cancelled ?? 0)
    })
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchPage(page, statusFilter, clientFilter)
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("job_update")
      socket.off("stats_update")
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [page, selectedJobId, statusFilter, clientFilter])

  const handleRowClick = (job) => {
    setSelectedJobId(job.job_id)
    fetchJobDetail(job.job_id)
  }

  const handleCloseModal = () => {
    setSelectedJobId(null)
    setSelectedJob(null)
  }

  const successRate = (globalCompleted + globalFailed) === 0
    ? 0
    : ((globalCompleted / (globalCompleted + globalFailed)) * 100).toFixed(2)

  const queuedJobs = [...jobs]
    .filter(j => j.status === "queued")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const queuePositions = {}
  queuedJobs.forEach((j, i) => { queuePositions[j.job_id] = i + 1 })

  const estimateStart = (queuePos) => {
    const slotsAvailable = Math.max(0, 5 - globalRunning)
    if (queuePos <= slotsAvailable) return "Starting soon"
    const waitSecs = (queuePos - slotsAvailable) * avgDuration.current
    if (waitSecs < 60) return `~${Math.round(waitSecs)}s`
    if (waitSecs < 3600) return `~${Math.round(waitSecs / 60)}m`
    return `~${(waitSecs / 3600).toFixed(1)}h`
  }

  const statCards = [
    { label: "Total Jobs", value: totalCount, color: "text-white", icon: "📋", filter: null },
    { label: "Running", value: globalRunning, color: "text-blue-400", icon: "⚡", filter: "running" },
    { label: "Failed", value: globalFailed, color: "text-red-400", icon: "✗", filter: "failed" },
    { label: "Success Rate", value: `${successRate}%`, color: "text-green-400", icon: "✓", filter: "completed" },
  ]

  const hasFilters = statusFilter || clientFilter

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Batch Job Monitor</h1>
            <p className="text-gray-500 text-sm mt-1">Real-time enterprise job tracking</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 shadow-sm shadow-green-400" : "bg-red-400"}`} />
            <span className="text-gray-400">{connected ? "Live" : "Reconnecting..."}</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {statCards.map(card => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              color={card.color}
              icon={card.icon}
              filter={card.filter}
              active={statusFilter === card.filter && card.filter !== null}
              onClick={() => handleStatClick(card.filter)}
            />
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
          {["jobs", "tasks"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize
                ${tab === t ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

        {/* Jobs tab */}
        {tab === "jobs" && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">

            {/* Filter bar — always visible */}
            <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-3 bg-gray-800/20">
              {statusFilter && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Status:</span>
                  <span className="text-xs text-white font-medium">{statusFilter}</span>
                  <button onClick={() => handleStatClick(statusFilter)} className="text-gray-500 hover:text-gray-300 text-xs ml-0.5">✕</button>
                </div>
              )}
              {clientFilter && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Client:</span>
                  <span className="text-xs text-white font-medium">{clientFilter}</span>
                  <button onClick={() => handleClientChange("")} className="text-gray-500 hover:text-gray-300 text-xs ml-0.5">✕</button>
                </div>
              )}
              {hasFilters && (
                <span className="text-xs text-gray-600">
                  {filteredTotal} result{filteredTotal !== 1 ? "s" : ""}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={clientFilter}
                  onChange={e => handleClientChange(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500"
                >
                  <option value="">All clients</option>
                  {CLIENTS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Job</th>
                  <th className="text-left px-4 py-3">Client</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3 w-44">Progress</th>
                  <th className="text-left px-4 py-3">Duration</th>
                  <th className="text-left px-4 py-3">Start Time</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    selected={selectedJobId === job.job_id}
                    onClick={() => handleRowClick(job)}
                    onCancel={() => handleCancelJob(job.job_id, job.job_name)}
                    queuePos={queuePositions[job.job_id]}
                    estimateStart={estimateStart}
                  />
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <p className="text-gray-500 text-xs">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tasks tab */}
        {tab === "tasks" && <TasksTab addToast={addToast} />}

      </div>

      <JobModal job={selectedJob} onClose={handleCloseModal} />
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
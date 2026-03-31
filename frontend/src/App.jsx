import { useEffect, useState, useRef } from "react"

const STATUS_STYLES = {
  completed: "bg-green-500/20 text-green-400 border border-green-500/30",
  running:   "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  failed:    "bg-red-500/20 text-red-400 border border-red-500/30",
  queued:    "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
}

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? "bg-gray-500/20 text-gray-400"}`}>
      {status}
    </span>
  )
}

function ProgressBar({ value }) {
  return (
    <div className="w-full bg-gray-700 rounded-full h-1.5">
      <div
        className="bg-blue-500 h-1.5 rounded-full transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

function Toast({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium cursor-pointer transition-all
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
            <h2 className="text-lg font-bold text-white">{job.job_name}</h2>
            <p className="text-gray-500 text-xs mt-1">{job.job_id}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={job.status} />
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>Progress</span>
              <span>{job.progress}%</span>
            </div>
            <ProgressBar value={job.progress} />
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

          {job.depends_on_job_id && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Depends On</p>
              <p className="text-white text-sm font-mono">{job.depends_on_job_id}</p>
            </div>
          )}

          {job.error_message && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-xs uppercase tracking-wider mb-2 font-medium">Error</p>
              <p className="text-red-300 text-sm">{job.error_message}</p>
              {job.error_type && (
                <p className="text-red-500 text-xs mt-1 font-mono">{job.error_type}</p>
              )}
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

export default function App() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [globalRunning, setGlobalRunning] = useState(0)
  const [globalFailed, setGlobalFailed] = useState(0)
  const [globalCompleted, setGlobalCompleted] = useState(0)

  const [selectedJobId, setSelectedJobId] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)

  const [toasts, setToasts] = useState([])

  const previousJobs = useRef({})

  const addToast = (message, type) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const fetchJobDetail = (jobId) => {
    fetch(`${import.meta.env.VITE_API_URL}/jobs/${jobId}`)
      .then(r => r.json())
      .then(data => setSelectedJob(data))
      .catch(() => {})
  }

  useEffect(() => {
    const fetchJobs = () => {
      fetch(`${import.meta.env.VITE_API_URL}/jobs?page=${page}&limit=20`)
        .then(r => r.json())
        .then(data => {
          data.jobs.forEach(job => {
            const prev = previousJobs.current[job.job_id]
            if (prev === "running" && job.status === "failed") {
              addToast(`${job.job_name} failed`, "failed")
            } else if (prev === "running" && job.status === "completed") {
              addToast(`${job.job_name} completed`, "completed")
            }
          })

          const nextSnapshot = {}
          data.jobs.forEach(job => {
            nextSnapshot[job.job_id] = job.status
          })
          previousJobs.current = nextSnapshot

          setJobs(data.jobs)
          setTotalPages(data.pages)
          setTotalCount(data.total)
          setGlobalRunning(data.running)
          setGlobalFailed(data.failed)
          setGlobalCompleted(data.completed)
          if (loading) setLoading(false)
        })
        .catch(() => { setError("Could not reach backend"); setLoading(false) })

      if (selectedJobId) {
        fetchJobDetail(selectedJobId)
      }
    }

    fetchJobs()
    const interval = setInterval(fetchJobs, 4000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchJobs()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [page, selectedJobId])

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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Batch Job Monitor</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time enterprise job tracking</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Total Jobs</p>
            <p className="text-2xl font-bold text-white">{totalCount}</p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Running</p>
            <p className="text-2xl font-bold text-blue-400">{globalRunning}</p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Failed</p>
            <p className="text-2xl font-bold text-red-400">{globalFailed}</p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Success Rate</p>
            <p className="text-2xl font-bold text-green-400">{successRate}%</p>
          </div>
        </div>

        {error && <p className="text-red-400">{error}</p>}

        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Job</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 w-40">Progress</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr
                  key={job.id}
                  onClick={() => handleRowClick(job)}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer
                    ${selectedJobId === job.job_id ? "bg-gray-800/60 ring-1 ring-inset ring-blue-500/30" : ""}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{job.job_name}</div>
                    <div className="text-gray-500 text-xs">{job.job_id}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{job.client}</td>
                  <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={job.progress} />
                      <span className="text-gray-400 text-xs w-8">{job.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {job.duration ? `${job.duration}s` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(job.created_at + "Z").toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <p className="text-gray-400 text-xs">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-700"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded disabled:opacity-40 hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <JobModal job={selectedJob} onClose={handleCloseModal} />
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
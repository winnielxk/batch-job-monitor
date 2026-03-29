import { useEffect, useState } from "react"

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

  useEffect(() => {
    const fetchJobs = () => {
      fetch(`http://localhost:5001/jobs?page=${page}&limit=20`)
        .then(r => r.json())
        .then(data => {
          setJobs(data.jobs)
          setTotalPages(data.pages)
          setTotalCount(data.total)
          setGlobalRunning(data.running)
          setGlobalFailed(data.failed)
          setGlobalCompleted(data.completed)
          if (loading) setLoading(false)
        })
        .catch(() => { setError("Could not reach backend"); setLoading(false) })
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
  }, [page])

  const successRate = (globalCompleted + globalFailed) === 0 ? 0 : ((globalCompleted / (globalCompleted + globalFailed)) * 100).toFixed(2)

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
                <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors">
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
                    {new Date(job.created_at).toLocaleTimeString()}
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
    </div>
  )
}
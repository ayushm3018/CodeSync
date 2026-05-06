import { useState } from "react"
import { useNavigate } from "react-router-dom"

const SERVER_URL = import.meta.env.PROD ? "" : "http://localhost:3000"

const FEATURES = [
  {
    icon: "⚡",
    title: "Real-time Sync",
    desc: "Multiple users edit simultaneously with zero conflicts, powered by Y.js CRDTs.",
    color: "#3b82f6",
  },
  {
    icon: "🤖",
    title: "AI Assistant",
    desc: "Built-in CodeAssist powered by Gemini — ask questions, get reviews, fix bugs.",
    color: "#a855f7",
  },
  {
    icon: "▶",
    title: "Code Execution",
    desc: "Run code in 15+ languages directly in the browser. Output synced to all users.",
    color: "#22c55e",
  },
  {
    icon: "🌐",
    title: "Multi-language",
    desc: "50+ language syntax highlighting with instant switching, no reload needed.",
    color: "#f59e0b",
  },
]

function Landing() {
  const navigate = useNavigate()
  const [mode, setMode] = useState(null)
  const [username, setUsername] = useState("")
  const [roomId, setRoomId] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!username.trim()) return setError("Username required")
    setError("")
    setLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator: username.trim() }),
      })
      if (!res.ok) throw new Error("Failed to create room")
      const { id } = await res.json()
      navigate(`/room/${id}?username=${encodeURIComponent(username.trim())}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!username.trim() || !roomId.trim()) return setError("Both fields required")
    setError("")
    setLoading(true)
    try {
      const id = roomId.trim().toUpperCase()
      const res = await fetch(`${SERVER_URL}/rooms/${id}`)
      if (!res.ok) {
        setError("Room not found")
        setLoading(false)
        return
      }
      navigate(`/room/${id}?username=${encodeURIComponent(username.trim())}`)
    } catch {
      setError("Network error")
      setLoading(false)
    }
  }

  if (mode) {
    return (
      <main className="min-h-screen w-full bg-neutral-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <button
            onClick={() => { setMode(null); setError("") }}
            className="text-gray-400 hover:text-white text-sm mb-6 flex items-center gap-1 transition-colors"
          >
            ← Back
          </button>
          <h2 className="text-2xl font-bold text-white mb-6">
            {mode === "create" ? "Create a Room" : "Join a Room"}
          </h2>
          <form
            onSubmit={mode === "create" ? handleCreate : handleJoin}
            className="flex flex-col gap-3"
          >
            <input
              type="text"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="px-4 py-3 rounded-lg bg-neutral-800 text-white border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
              autoFocus
            />
            {mode === "join" && (
              <input
                type="text"
                placeholder="Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                className="px-4 py-3 rounded-lg bg-neutral-800 text-white border border-neutral-700 font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-gray-500"
              />
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className={`py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors ${
                mode === "create"
                  ? "bg-blue-600 hover:bg-blue-500 text-white"
                  : "bg-amber-500 hover:bg-amber-400 text-gray-900"
              }`}
            >
              {loading ? "..." : mode === "create" ? "Create Room" : "Join Room"}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen w-full bg-neutral-950 flex flex-col">
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-24 text-center">
        <div className="mb-5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-xs text-gray-400 uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Open beta
        </div>
        <h1 className="text-7xl font-extrabold text-white tracking-tight mb-4">
          Code<span className="text-blue-500">Sync</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-xl mb-10 leading-relaxed">
          Real-time collaborative code editor with built-in AI assistance and live code execution.
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => setMode("create")}
            className="px-8 py-3.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode("join")}
            className="px-8 py-3.5 rounded-xl bg-neutral-800 text-white font-semibold hover:bg-neutral-700 transition-colors border border-neutral-700"
          >
            Join Room
          </button>
        </div>
      </div>

      <div className="px-6 pb-24 max-w-4xl mx-auto w-full">
        <p className="text-center text-gray-600 text-xs uppercase tracking-widest mb-8">
          Everything you need to code together
        </p>
        <div className="grid grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-neutral-900 rounded-xl p-5 border border-neutral-800 border-l-4"
              style={{ borderLeftColor: f.color }}
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="text-white font-semibold mb-1">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export default Landing

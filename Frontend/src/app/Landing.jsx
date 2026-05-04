import { useState } from "react"
import { useNavigate } from "react-router-dom"

const SERVER_URL = import.meta.env.PROD ? "" : "http://localhost:3000"

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

  if (!mode) {
    return (
      <main className="h-screen w-full bg-gray-950 flex flex-col items-center justify-center gap-8">
        <h1 className="text-5xl font-bold text-white">CodeSync</h1>
        <p className="text-gray-400">Real-time collaborative code editor</p>
        <div className="flex gap-4">
          <button
            onClick={() => setMode("create")}
            className="px-6 py-3 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode("join")}
            className="px-6 py-3 rounded-lg bg-amber-500 text-gray-900 font-semibold hover:bg-amber-600"
          >
            Join Room
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen w-full bg-gray-950 flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold text-white">
        {mode === "create" ? "Create a Room" : "Join a Room"}
      </h1>
      <form
        onSubmit={mode === "create" ? handleCreate : handleJoin}
        className="flex flex-col gap-3 w-72"
      >
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="p-2 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        {mode === "join" && (
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            className="p-2 rounded-lg bg-gray-800 text-white font-mono uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className={`p-2 rounded-lg text-white font-semibold disabled:opacity-50 ${
            mode === "create" ? "bg-blue-500 hover:bg-blue-600" : "bg-amber-500 text-gray-900 hover:bg-amber-600"
          }`}
        >
          {loading ? "..." : mode === "create" ? "Create" : "Join"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(null)
            setError("")
          }}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back
        </button>
      </form>
    </main>
  )
}

export default Landing

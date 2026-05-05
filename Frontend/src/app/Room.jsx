import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useState, useEffect } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useCollab } from "../hooks/useCollab"
import Chat from "./Chat"

const SERVER_URL = import.meta.env.PROD ? "" : "http://localhost:3000"

const LANGUAGES = [
  "javascript", "typescript", "python", "java", "cpp", "c", "csharp",
  "go", "rust", "ruby", "php", "swift", "kotlin",
  "html", "css", "json", "markdown", "sql", "shell", "yaml",
]

const RUNNABLE_LANGUAGES = new Set([
  "javascript", "typescript", "python", "java", "cpp", "c", "csharp",
  "go", "rust", "ruby", "php", "swift", "kotlin", "shell", "sql",
])

const MIN_CHAT_HEIGHT = 180
const DEFAULT_CHAT_HEIGHT = 320

function Room() {
  const { id: roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const username = searchParams.get("username")
  const editorRef = useRef(null)
  const [copied, setCopied] = useState(false)

  const [chatOpen, setChatOpen] = useState(() => localStorage.getItem("chatOpen") === "true")
  const [chatHeight, setChatHeight] = useState(() => {
    const saved = Number(localStorage.getItem("chatHeight"))
    return saved && saved >= MIN_CHAT_HEIGHT ? saved : DEFAULT_CHAT_HEIGHT
  })
  const [isResizing, setIsResizing] = useState(false)
  const [unread, setUnread] = useState(0)
  const lastSeenLengthRef = useRef(0)

  useEffect(() => {
    if (!username) navigate("/")
  }, [username, navigate])

  const {
    yText, yChat, awareness, users, creator, error, connected,
    language, changeLanguage,
    runState, triggerRun, clearEditor,
  } = useCollab({ url: SERVER_URL, roomId, username })

  const [outputOpen, setOutputOpen] = useState(true)
  const lastRunIdRef = useRef(null)

  useEffect(() => {
    if (runState && runState.id !== lastRunIdRef.current) {
      lastRunIdRef.current = runState.id
      setOutputOpen(true)
    }
  }, [runState])

  const canRun = RUNNABLE_LANGUAGES.has(language) && runState?.status !== "running"
  const isRunning = runState?.status === "running"

  const handleClear = () => {
    if (yText.length === 0) return
    if (window.confirm("Clear all code? This affects everyone in the room.")) {
      clearEditor()
    }
  }

  // Track unread count when chat is closed
  useEffect(() => {
    const update = () => {
      const len = yChat.length
      if (chatOpen) {
        lastSeenLengthRef.current = len
        setUnread(0)
        return
      }
      const lastMsg = len > 0 ? yChat.get(len - 1) : null
      if (lastMsg && lastMsg.get("role") === "assistant") {
        setUnread(Math.max(0, len - lastSeenLengthRef.current))
      }
    }
    yChat.observe(update)
    return () => yChat.unobserve(update)
  }, [yChat, chatOpen])

  useEffect(() => {
    if (chatOpen) {
      lastSeenLengthRef.current = yChat.length
      setUnread(0)
    }
    localStorage.setItem("chatOpen", String(chatOpen))
  }, [chatOpen, yChat])

  // Resize logic
  useEffect(() => {
    if (!isResizing) return
    const onMove = (e) => {
      const next = window.innerHeight - e.clientY
      const clamped = Math.max(MIN_CHAT_HEIGHT, Math.min(window.innerHeight * 0.7, next))
      setChatHeight(clamped)
    }
    const onUp = () => {
      setIsResizing(false)
      localStorage.setItem("chatHeight", String(chatHeight))
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    document.body.style.cursor = "ns-resize"
    document.body.style.userSelect = "none"
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing, chatHeight])

  // Cmd/Ctrl+I shortcut
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault()
        setChatOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const handleMount = (editor) => {
    editorRef.current = editor
    new MonacoBinding(yText, editor.getModel(), new Set([editor]), awareness)
  }

  const copyId = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!username) return null

  if (error) {
    return (
      <main className="h-screen w-full bg-gray-950 flex flex-col items-center justify-center gap-4">
        <h1 className="text-3xl font-bold text-red-400">{error}</h1>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold"
        >
          Back to home
        </button>
      </main>
    )
  }

  return (
    <main className="h-screen w-full bg-gray-950 flex flex-col gap-2 p-2">
      <div className="flex gap-2 flex-1 min-h-0">
        <aside className="h-full w-1/4 bg-amber-50 rounded-lg flex flex-col">
          <div className="p-4 border-b border-gray-300 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-600 uppercase tracking-wide">Room</p>
                <span
                  title={connected ? "Connected" : "Disconnected"}
                  className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connected ? "bg-green-500 animate-pulse" : "bg-red-500"
                    }`}
                  />
                  {connected ? "Live" : "Offline"}
                </span>
              </div>
              <p className="font-mono text-lg font-bold tracking-wider">{roomId}</p>
            </div>
            <button
              onClick={copyId}
              className="px-3 py-1 text-xs bg-gray-800 text-white rounded hover:bg-gray-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="px-4 pt-3 pb-2 border-b border-gray-300">
            <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Language</p>
            <select
              value={language}
              onChange={(e) => changeLanguage(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-white border border-gray-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <h2 className="text-xl font-bold p-4 pb-2">Users</h2>
          <ul className="px-4 pb-4 flex-1 overflow-y-auto">
            {users.map((user, index) => {
              const isCreator = user.name === creator
              return (
                <li
                  key={index}
                  className={`p-2 rounded mb-2 flex items-center justify-between ${
                    isCreator
                      ? "bg-amber-400 text-gray-900 font-semibold border-l-4 border-amber-700"
                      : "bg-gray-800 text-white"
                  }`}
                >
                  <span>{user.name}</span>
                  {isCreator && (
                    <span className="text-[10px] uppercase tracking-wide bg-amber-700 text-amber-50 px-2 py-0.5 rounded">
                      creator
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="w-3/4 bg-neutral-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between bg-neutral-900">
            <div className="flex items-center gap-2">
              <button
                onClick={triggerRun}
                disabled={!canRun}
                title={
                  !RUNNABLE_LANGUAGES.has(language)
                    ? `${language} can't be executed`
                    : isRunning
                      ? "A run is already in progress"
                      : "Run code"
                }
                className="px-3 py-1 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {isRunning ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    Running
                  </>
                ) : (
                  <>▶ Run</>
                )}
              </button>
              <button
                onClick={handleClear}
                className="px-3 py-1 text-xs font-semibold rounded bg-neutral-700 text-gray-200 hover:bg-neutral-600"
              >
                Clear
              </button>
            </div>
            <span className="text-xs text-gray-400 font-mono">{language}</span>
          </div>

          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={language}
              defaultValue="// start typing..."
              theme="vs-dark"
              onMount={handleMount}
            />
          </div>

          {runState && outputOpen && (
            <div className="border-t border-neutral-700 max-h-[40%] overflow-hidden flex flex-col">
              <div className="px-3 py-1.5 flex justify-between items-center bg-neutral-900 border-b border-neutral-800">
                <span className="text-xs text-gray-300">
                  {runState.status === "running" && (
                    <>⏳ <span className="font-semibold">{runState.runBy}</span> is running {runState.language}…</>
                  )}
                  {runState.status === "done" && (
                    <>
                      Output{" "}
                      <span className="text-gray-500">
                        (ran by {runState.runBy} · exit {runState.exitCode})
                      </span>
                    </>
                  )}
                  {runState.status === "error" && (
                    <span className="text-red-400">Run failed: {runState.error}</span>
                  )}
                </span>
                <button
                  onClick={() => setOutputOpen(false)}
                  className="text-gray-400 hover:text-white text-lg leading-none px-2"
                  title="Close"
                >
                  ×
                </button>
              </div>
              <div className="overflow-y-auto p-3 font-mono text-xs text-gray-200 whitespace-pre-wrap">
                {runState.compileStderr && (
                  <div className="text-yellow-400 mb-2">{runState.compileStderr}</div>
                )}
                {runState.stdout || ""}
                {runState.stderr && (
                  <div className="text-red-400 mt-2">{runState.stderr}</div>
                )}
                {runState.status === "done" &&
                  !runState.stdout &&
                  !runState.stderr &&
                  !runState.compileStderr && (
                    <span className="text-gray-500 italic">(no output)</span>
                  )}
              </div>
            </div>
          )}

          {runState && !outputOpen && (
            <button
              onClick={() => setOutputOpen(true)}
              className="px-3 py-1 text-xs text-gray-400 hover:text-white border-t border-neutral-700 bg-neutral-900 text-left"
            >
              Show output ▲
            </button>
          )}
        </section>
      </div>

      {chatOpen && (
        <div style={{ height: chatHeight }} className="shrink-0">
          <Chat
            yChat={yChat}
            username={username}
            onClose={() => setChatOpen(false)}
            onResizeStart={() => setIsResizing(true)}
          />
        </div>
      )}

      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Open CodeAssist (⌘+I)"
          className="fixed bottom-6 left-6 z-50 group flex items-center gap-2 px-4 py-3 rounded-full
                     bg-linear-to-br from-purple-600 to-pink-600 text-white font-semibold shadow-lg shadow-purple-500/40
                     hover:shadow-purple-500/60 hover:scale-105 transition-all
                     ring-2 ring-purple-400/50 animate-pulse-slow"
        >
          <span className="text-lg">✨</span>
          <span>CodeAssist</span>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-gray-950">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    </main>
  )
}

export default Room

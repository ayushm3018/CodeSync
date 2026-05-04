import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useState, useEffect } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useCollab } from "../hooks/useCollab"

const SERVER_URL = import.meta.env.PROD ? "" : "http://localhost:3000"

function Room() {
  const { id: roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const username = searchParams.get("username")
  const editorRef = useRef(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!username) navigate("/")
  }, [username, navigate])

  const { yText, awareness, users, creator, error, connected } = useCollab({
    url: SERVER_URL,
    roomId,
    username,
  })

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
    <main className="h-screen w-full bg-gray-950 flex gap-4 p-2">
      <aside className="h-full w-1/4 bg-amber-50 rounded-lg flex flex-col">
        <div className="p-4 border-b border-gray-300 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-600 uppercase tracking-wide">Room</p>
              <span
                title={connected ? "Connected" : "Disconnected"}
                className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  connected
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
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
      <section className="w-3/4 bg-neutral-800 rounded-lg overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          defaultValue="// start typing..."
          theme="vs-dark"
          onMount={handleMount}
        />
      </section>
    </main>
  )
}

export default Room

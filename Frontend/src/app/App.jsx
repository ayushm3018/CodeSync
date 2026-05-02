import "./App.css"
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useEffect, useState } from "react"
import * as Y from "yjs"
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness"
import { io } from "socket.io-client"

const ROOM_ID = "monaco"

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"]
const randomUser = () => ({
  name: `User-${Math.floor(Math.random() * 1000)}`,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
})

function App() {
  const [username, setUsername] = useState(()=>{
    return new URLSearchParams(window.location.search).get("username") || ""
  })
  const [users, setUsers] = useState([])
  const editorRef = useRef(null)
  const ydoc = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])
  const socketRef = useRef(null)

  useEffect(() => {
    if (!username) return
    awareness.setLocalStateField("user", { ...randomUser(), name: username })
  }, [awareness, username])

  useEffect(() => {
    const socket = io("http://localhost:3000")
    socketRef.current = socket

    socket.on("connect", () => {
      socket.emit("join", { roomId: ROOM_ID, clientId: awareness.clientID })
      const states = awareness.getStates()
      if (states.size > 0) {
        socket.emit("awareness", {
          roomId: ROOM_ID,
          clientId: awareness.clientID,
          update: encodeAwarenessUpdate(awareness, [...states.keys()]),
        })
      }
    })

    socket.on("sync", (update) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), "remote")
    })

    socket.on("update", (update) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), "remote")
    })

    socket.on("awareness", (update) => {
      applyAwarenessUpdate(awareness, new Uint8Array(update), "remote")
    })

    const onLocalDocUpdate = (update, origin) => {
      if (origin === "remote") return
      socket.emit("update", { roomId: ROOM_ID, update })
    }
    ydoc.on("update", onLocalDocUpdate)

    const onLocalAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === "remote") return
      const changedClients = added.concat(updated).concat(removed)
      socket.emit("awareness", {
        roomId: ROOM_ID,
        clientId: awareness.clientID,
        update: encodeAwarenessUpdate(awareness, changedClients),
      })
    }
    awareness.on("update", onLocalAwarenessUpdate)

    const onAwarenessChange = () => {
      const states = Array.from(awareness.getStates().values())
      console.log("[awareness] states:", states)
      setUsers(states.filter(s => s.user?.name).map(s => s.user))
    }
    awareness.on("change", onAwarenessChange)
    awareness.on("update", onAwarenessChange)

    return () => {
      ydoc.off("update", onLocalDocUpdate)
      awareness.off("update", onLocalAwarenessUpdate)
      awareness.off("change", onAwarenessChange)
      awareness.off("update", onAwarenessChange)
      socket.disconnect()
    }
  }, [ydoc, awareness])

  const handleMount = (editor) => {
    editorRef.current = editor
    new MonacoBinding(yText, editor.getModel(), new Set([editor]), awareness)
  }

  const handleJoin =(e) =>{
    e.preventDefault()
    setUsername(e.target.username.value)
    window.history.pushState({}, "", "?username=" + e.target.username.value)
  }

  

  if(!username){
    return (
      <main className = "h-screen w-full bg-gray-950 flex gap-4 items-center justify-center">
      <form className="flex flex-col gap-4" onSubmit={handleJoin}>
      <input
      type="text"
      placeholder="Enter your username"
      className="p-2 rounded-lg bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      name="username"
     
    />
    <button 
     className = "p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">Join</button>
      </form>

      </main>
    )
  }

  return (
    <main className="h-screen w-full bg-gray-950 flex gap-4">
      <aside className="h-full w-1/4 bg-amber-50 rounded-lg">
        <h2 className="text-2xl font-bold p-4 border-b border-gray-300">Users</h2>
        <ul className="p-4">
        {users.map((user, index)=>(
          <li key={index} className="p-2 bg-gray-800 text-white rounded mb-2">
        {user.name}
        </li>
        ))}
      </ul>
      </aside>
      <section className="w-3/4 bg-neutral-800 rounded-lg overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          defaultValue="// some comment"
          theme="vs-dark"
          onMount={handleMount}
        />
      </section>
    </main>
  )
}

export default App

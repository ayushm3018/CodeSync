import "./App.css"
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useEffect } from "react"
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
  const editorRef = useRef(null)
  const ydoc = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])
  const socketRef = useRef(null)

  useEffect(() => {
    awareness.setLocalStateField("user", randomUser())

    const socket = io("http://localhost:3000")
    socketRef.current = socket

    socket.on("connect", () => {
      socket.emit("join", ROOM_ID)
      const states = awareness.getStates()
      if (states.size > 0) {
        socket.emit("awareness", {
          roomId: ROOM_ID,
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
        update: encodeAwarenessUpdate(awareness, changedClients),
      })
    }
    awareness.on("update", onLocalAwarenessUpdate)

    return () => {
      ydoc.off("update", onLocalDocUpdate)
      awareness.off("update", onLocalAwarenessUpdate)
      awareness.destroy()
      socket.disconnect()
    }
  }, [ydoc, awareness])

  const handleMount = (editor) => {
    editorRef.current = editor
    new MonacoBinding(yText, editor.getModel(), new Set([editor]), awareness)
  }

  return (
    <main className="h-screen w-full bg-gray-950 flex gap-4">
      <aside className="h-full w-1/4 bg-amber-50 rounded-lg"></aside>
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

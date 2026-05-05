import { useState, useEffect, useMemo, useRef } from "react"
import * as Y from "yjs"
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness"
import { io } from "socket.io-client"

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"]
const pickColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

export function useCollab({ url, roomId, username }) {
  const ydoc = useMemo(() => new Y.Doc(), [roomId])
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc])
  const yChat = useMemo(() => ydoc.getArray("chat"), [ydoc])
  const yMeta = useMemo(() => ydoc.getMap("meta"), [ydoc])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])
  const [users, setUsers] = useState([])
  const [creator, setCreator] = useState(null)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [language, setLanguage] = useState(() => yMeta.get("language") || "javascript")
  const [runState, setRunState] = useState(() => yMeta.get("run") || null)
  const colorRef = useRef(pickColor())
  const socketRef = useRef(null)

  useEffect(() => {
    if (!username) return
    awareness.setLocalStateField("user", { name: username, color: colorRef.current })
  }, [awareness, username])

  useEffect(() => {
    const onMetaChange = () => {
      setLanguage(yMeta.get("language") || "javascript")
      setRunState(yMeta.get("run") || null)
    }
    yMeta.observe(onMetaChange)
    onMetaChange()
    return () => yMeta.unobserve(onMetaChange)
  }, [yMeta])

  const changeLanguage = (lang) => {
    yMeta.set("language", lang)
  }

  const triggerRun = () => {
    if (socketRef.current) socketRef.current.emit("run", { roomId, runBy: username })
  }

  const clearEditor = () => {
    if (yText.length > 0) yText.delete(0, yText.length)
  }

  useEffect(() => {
    if (!roomId || !username) return
    const socket = io(url)
    socketRef.current = socket

    socket.on("connect", () => {
      setConnected(true)
      socket.emit("join", { roomId, clientId: awareness.clientID })
    })

    socket.on("disconnect", () => {
      setConnected(false)
    })

    socket.on("room-info", ({ creator }) => {
      setCreator(creator)
      const states = awareness.getStates()
      if (states.size > 0) {
        socket.emit("awareness", {
          roomId,
          clientId: awareness.clientID,
          update: encodeAwarenessUpdate(awareness, [...states.keys()]),
        })
      }
    })

    socket.on("room-error", ({ message }) => {
      setError(message)
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
      socket.emit("update", { roomId, update })
    }
    ydoc.on("update", onLocalDocUpdate)

    const onLocalAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === "remote") return
      const changedClients = added.concat(updated).concat(removed)
      socket.emit("awareness", {
        roomId,
        clientId: awareness.clientID,
        update: encodeAwarenessUpdate(awareness, changedClients),
      })
    }
    awareness.on("update", onLocalAwarenessUpdate)

    const onAwarenessChange = () => {
      const states = Array.from(awareness.getStates().values())
      setUsers(states.filter((s) => s.user?.name).map((s) => s.user))
    }
    awareness.on("change", onAwarenessChange)

    return () => {
      ydoc.off("update", onLocalDocUpdate)
      awareness.off("update", onLocalAwarenessUpdate)
      awareness.off("change", onAwarenessChange)
      socket.disconnect()
      socketRef.current = null
    }
  }, [url, roomId, username, ydoc, awareness])

  return {
    yText, yChat, awareness, users, creator, error, connected,
    language, changeLanguage,
    runState, triggerRun,
    clearEditor,
  }
}

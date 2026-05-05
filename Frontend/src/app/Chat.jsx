import { useState, useEffect, useRef } from "react"
import * as Y from "yjs"

function Chat({ yChat, username }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const scrollRef = useRef(null)

  useEffect(() => {
    const update = () => {
      setMessages(
        yChat.toArray().map((m) => ({
          id: m.get("id"),
          role: m.get("role"),
          username: m.get("username"),
          content: m.get("content"),
          timestamp: m.get("timestamp"),
        }))
      )
    }
    yChat.observe(update)
    update()
    return () => yChat.unobserve(update)
  }, [yChat])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const send = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const msg = new Y.Map()
    msg.set("id", `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    msg.set("role", "user")
    msg.set("username", username)
    msg.set("content", input.trim())
    msg.set("timestamp", Date.now())
    yChat.push([msg])
    setInput("")
  }

  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user"

  return (
    <div className="h-full bg-neutral-900 rounded-lg flex flex-col border border-neutral-800">
      <div className="px-4 py-2 border-b border-neutral-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-purple-500" />
        <h3 className="text-white font-semibold">CodeAssist</h3>
        <span className="text-xs text-gray-400">— ask anything about the code</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">Ask anything about the code in the editor.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-purple-700 text-white"
              }`}
            >
              <p className="text-[10px] opacity-75 mb-1 font-semibold uppercase tracking-wide">
                {m.username}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </div>
          </div>
        ))}
        {lastIsUser && (
          <div className="flex justify-start">
            <div className="bg-purple-700/50 text-white rounded-lg px-3 py-2 text-sm italic opacity-70">
              CodeAssist is thinking...
            </div>
          </div>
        )}
      </div>
      <form onSubmit={send} className="p-3 border-t border-neutral-800 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask CodeAssist..."
          className="flex-1 px-3 py-2 rounded bg-neutral-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="px-4 py-2 rounded bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default Chat

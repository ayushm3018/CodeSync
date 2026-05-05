import { useState, useEffect, useRef } from "react"
import * as Y from "yjs"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const QUICK_PROMPTS = [
  { label: "Explain", prompt: "Explain what this code does." },
  { label: "Find bugs", prompt: "Are there any bugs or issues with this code?" },
  { label: "Improve", prompt: "Suggest improvements to this code." },
  { label: "Add comments", prompt: "Add helpful comments to this code." },
]

function Chat({ yChat, username, onClose, onResizeStart }) {
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
          streaming: m.get("streaming"),
        }))
      )
    }
    yChat.observeDeep(update)
    update()
    return () => yChat.unobserveDeep(update)
  }, [yChat])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const send = (content) => {
    if (!content.trim()) return
    const msg = new Y.Map()
    msg.set("id", `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    msg.set("role", "user")
    msg.set("username", username)
    msg.set("content", content.trim())
    msg.set("timestamp", Date.now())
    yChat.push([msg])
    setInput("")
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    send(input)
  }

  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user"
  const lastIsStreamingEmpty =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    messages[messages.length - 1].streaming &&
    !messages[messages.length - 1].content

  return (
    <div className="h-full bg-neutral-900 rounded-lg flex flex-col border border-neutral-800 relative">
      <div
        onMouseDown={onResizeStart}
        className="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize hover:bg-purple-500/30 z-10"
        title="Drag to resize"
      />

      <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          <h3 className="text-white font-semibold">CodeAssist</h3>
          <span className="text-xs text-gray-400">— ask anything about the code</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-2"
            title="Close"
          >
            ×
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">Ask anything about the code in the editor, or use a quick prompt below.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-purple-700 text-white"
              }`}
            >
              <p className="text-[10px] opacity-75 mb-1 font-semibold uppercase tracking-wide">
                {m.username}
              </p>
              {m.role === "assistant" ? (
                <div className="leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside ml-1 mb-1 space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside ml-1 mb-1 space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                      code: ({ inline, children }) =>
                        inline ? (
                          <code className="bg-neutral-900 px-1 py-0.5 rounded text-purple-200 text-[12px]">{children}</code>
                        ) : (
                          <code className="block bg-neutral-900 p-2 rounded my-2 overflow-x-auto text-[12px] whitespace-pre">{children}</code>
                        ),
                      pre: ({ children }) => <>{children}</>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                          {children}
                        </a>
                      ),
                      h1: ({ children }) => <h1 className="text-base font-bold my-1">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold my-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold my-1">{children}</h3>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                  {m.streaming && m.content && (
                    <span className="inline-block w-1.5 h-3 ml-0.5 bg-white/80 animate-pulse align-middle" />
                  )}
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {(lastIsUser || lastIsStreamingEmpty) && (
          <div className="flex justify-start">
            <div className="bg-purple-700/50 text-white rounded-lg px-3 py-2 text-sm italic opacity-70">
              CodeAssist is thinking...
            </div>
          </div>
        )}
      </div>

      <div className="px-3 pt-2 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            onClick={() => setInput(q.prompt)}
            className="px-2.5 py-1 text-xs rounded-full bg-neutral-800 text-gray-300 hover:bg-neutral-700 hover:text-white border border-neutral-700"
          >
            {q.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-3 flex gap-2">
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

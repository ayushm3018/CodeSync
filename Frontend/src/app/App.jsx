import "./App.css"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Landing from "./Landing"
import Room from "./Room"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/room/:id" element={<Room />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

import React, { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import PurchaseOrders from './pages/PurchaseOrders'
import Messages from './pages/Messages'
import Machines from './pages/Machines'
import Setting from './pages/Setting'
import 'bootstrap/dist/css/bootstrap.min.css'
import './App.css'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  return (
    <div className="app">
      <Navbar onToggleSidebar={handleToggleSidebar} />
      <div className="app-body">
        <Sidebar isOpen={sidebarOpen} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/machines" element={<Machines />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/settings" element={<Setting />} />
          </Routes>
        </main> 
      </div>
    </div>
  )
}

export default App

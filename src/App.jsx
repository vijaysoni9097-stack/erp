import React, { useState } from 'react'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import PurchaseOrders from './pages/PurchaseOrders'
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
          <PurchaseOrders />
        </main>
      </div>
    </div>
  )
}

export default App

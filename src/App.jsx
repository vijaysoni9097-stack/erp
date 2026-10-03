import React, { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Medicines from './pages/Medicines'
import Orders from './pages/Orders'
import StockManagement from './pages/StockManagement'
import ExpiryAlerts from './pages/ExpiryAlerts'
import Suppliers from './pages/Suppliers'
import PurchaseOrders from './pages/PurchaseOrders'
import Transfers from './pages/Transfers'
import Messages from './pages/Messages'
import Machines from './pages/Machines'
import Setting from './pages/Setting'
import Login from './pages/Login'
import 'bootstrap/dist/css/bootstrap.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './App.css'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem('access_token') === 'admin-session')

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleLogin = () => {
    localStorage.setItem('access_token', 'admin-session')
    setAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    sessionStorage.clear()
    setAuthenticated(false)
  }

  if (!authenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <div className="app">
      <Navbar onToggleSidebar={handleToggleSidebar} onLogout={handleLogout} />
      <div className="app-body">
        <Sidebar isOpen={sidebarOpen} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/medicines" element={<Medicines />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/stock-management" element={<StockManagement />} />
            <Route path="/expiry-alerts" element={<ExpiryAlerts />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/machines" element={<Machines />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route path="/settings/profile" element={<Setting onLogout={handleLogout} />} />
            <Route path="/settings/password" element={<Setting onLogout={handleLogout} />} />
            <Route path="/settings/prescription-preferences" element={<Setting onLogout={handleLogout} />} />
            <Route path="/settings/inventory-preferences" element={<Setting onLogout={handleLogout} />} />
            <Route path="/inventory-preferences" element={<Setting onLogout={handleLogout} />} />
            <Route path="/settings/printer" element={<Setting onLogout={handleLogout} />} />
            <Route path="/settings/notifications" element={<Setting onLogout={handleLogout} />} />
            <Route path="/settings/security" element={<Setting onLogout={handleLogout} />} />
          </Routes>
        </main> 
      </div>
    </div>
  )
}

export default App

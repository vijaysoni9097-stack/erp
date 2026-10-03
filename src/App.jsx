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
import 'bootstrap/dist/css/bootstrap.min.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
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
            <Route path="/settings/profile" element={<Setting />} />
            <Route path="/settings/password" element={<Setting />} />
            <Route path="/settings/prescription-preferences" element={<Setting />} />
            <Route path="/settings/inventory-preferences" element={<Setting />} />
            <Route path="/inventory-preferences" element={<Setting />} />
            <Route path="/settings/printer" element={<Setting />} />
            <Route path="/settings/notifications" element={<Setting />} />
            <Route path="/settings/security" element={<Setting />} />
          </Routes>
        </main> 
      </div>
    </div>
  )
}

export default App

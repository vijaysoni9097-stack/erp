import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Sidebar.css";

function Sidebar() {
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const navigate = useNavigate();

  return (
    <div className="sidebar">

      <h4 className="menu-head">Main menu</h4>

      <button className="sidebar-button" onClick={() => navigate('/dashboard')}>
        Dashboard
      </button>

      <br />

      <button className="sidebar-button" onClick={() => navigate('/machines')}>
        Medicines
      </button>

      <br />

      
      <button
        className="sidebar-button"
        onClick={() => setInventoryOpen(!inventoryOpen)}
      >
        Inventory
        <span>{inventoryOpen ? "▼" : "▶"}</span>
      </button>

      {inventoryOpen && (
        <div className="submenu">

          <button
            className="submenu-button"
            onClick={() => navigate("/stock-management")}
          >
            • Stock Management
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/expiry-alerts")}
          >
            • Expiry Alerts
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/suppliers")}
          >
            • Suppliers
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/purchase-orders")}
          >
            • Purchase Orders
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/transfers")}
          >
            • Transfers
          </button>

        </div>
      )}

      <br />

  
      <button className="sidebar-button" onClick={() => navigate('/purchase-orders')}>
        Orders
      </button>

      <br />

   
      <button className="sidebar-button" onClick={() => navigate('/messages')}>
        Messages
      </button>

      <br />

     
      <button
        className="sidebar-button"
        onClick={() => setSettingsOpen(!settingsOpen)}
      >
        Settings
        <span>{settingsOpen ? "▼" : "▶"}</span>
      </button>

      {settingsOpen && (
        <div className="submenu">

          <button
            className="submenu-button"
            onClick={() => navigate("/profile-settings")}
          >
            • Profile Settings
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/change-password")}
          >
            • Change Password
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/prescription-preferences")}
          >
            • Prescription Preferences
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/inventory-preferences")}
          >
            • Inventory Preferences
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/printer-settings")}
          >
            • Printer Settings
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/notifications")}
          >
            • Notifications
          </button>

          <button
            className="submenu-button"
            onClick={() => navigate("/security")}
          >
            • Security
          </button>

        </div>
      )}

    </div>
  );
}

export default Sidebar;
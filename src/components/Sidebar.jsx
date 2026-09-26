import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/Sidebar.css";

const navigation = [
  { label: "Dashboard", path: "/dashboard", icon: "fa-table-cells-large" },
  { label: "Medicines", path: "/machines", icon: "fa-pills" },
  { label: "Inventory", icon: "fa-boxes-stacked", children: [["Stock Management", "/stock-management"], ["Expiry Alerts", "/expiry-alerts"], ["Suppliers", "/suppliers"]] },
  { label: "Orders", path: "/purchase-orders", icon: "fa-cart-shopping" },
  { label: "Messages", path: "/messages", icon: "fa-message" },
  { label: "Settings", path: "/settings", icon: "fa-gear" },
];

function Sidebar({ isOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  return <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
    <div className="sidebar-brand"><span className="brand-mark"><i /><i /><i /></span><strong>Preclinic</strong></div>
    <p className="menu-head">Main Menu</p>
    <nav className="sidebar-nav">{navigation.map((item) => {
      const active = item.path === location.pathname;
      if (item.children) return <div key={item.label}><button type="button" className={`sidebar-button ${inventoryOpen ? "expanded" : ""}`} onClick={() => setInventoryOpen((open) => !open)}><span><i className={`fa-solid ${item.icon}`} />{item.label}</span><i className={`fa-solid fa-chevron-${inventoryOpen ? "down" : "right"} sidebar-chevron`} /></button>{inventoryOpen && <div className="submenu">{item.children.map(([label, path]) => <button type="button" key={path} onClick={() => navigate(path)}>{label}</button>)}</div>}</div>;
      return <button type="button" key={item.label} className={`sidebar-button ${active ? "active" : ""}`} onClick={() => navigate(item.path)}><span><i className={`fa-solid ${item.icon}`} />{item.label}</span></button>;
    })}</nav>
    <div className="upgrade-card"><button type="button" className="upgrade-close" aria-label="Dismiss upgrade card">×</button><span className="upgrade-logo"><i /><i /><i /></span><strong>Upgrade To Pro</strong><p>Check 1 min video and begin use Preclinic like a pro</p><button type="button" className="upgrade-play" aria-label="Watch upgrade video"><i className="fa-solid fa-play" /></button></div>
  </aside>;
}
export default Sidebar;

import { useState } from "react";
import "../styles/dashboard.css";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const salesByPeriod = {
  "This Week": [
    { name: "Mon", units: 180, revenue: 8 },
    { name: "Tue", units: 210, revenue: 12 },
    { name: "Wed", units: 165, revenue: 10 },
    { name: "Thu", units: 240, revenue: 18 },
    { name: "Fri", units: 200, revenue: 14 },
    { name: "Sat", units: 260, revenue: 20 },
    { name: "Sun", units: 230, revenue: 16 },
  ],
  "This Month": [
    { name: "Week 1", units: 760, revenue: 58 },
    { name: "Week 2", units: 840, revenue: 66 },
    { name: "Week 3", units: 790, revenue: 60 },
    { name: "Week 4", units: 930, revenue: 74 },
  ],
  "This Year": [
    { name: "Jan", units: 2650, revenue: 210 },
    { name: "Mar", units: 3020, revenue: 240 },
    { name: "May", units: 3280, revenue: 266 },
    { name: "Jul", units: 3120, revenue: 252 },
    { name: "Sep", units: 3560, revenue: 294 },
    { name: "Nov", units: 3710, revenue: 310 },
  ],
};

const stockByCategory = [
  { name: "Tablets", value: 38, color: "#4356d8" },
  { name: "Capsules", value: 24, color: "#4a9b8f" },
  { name: "Syrups", value: 16, color: "#dfc251" },
  { name: "Injectables", value: 14, color: "#cb3886" },
  { name: "Others", value: 8, color: "#a8adb8" },
];

const summaryCards = [
  { label: "Total Medicines", value: "1,248", badge: "+12%", note: "In last 7 Days", icon: "fa-capsules", tone: "blue" },
  { label: "Pending Orders", value: "36", badge: "+5%", note: "Awaiting Fulfillment", icon: "fa-cart-shopping", tone: "yellow" },
  { label: "Low Stock Items", value: "18", badge: "+3%", note: "Need Reordering", icon: "fa-triangle-exclamation", tone: "red" },
  { label: "Expiring Soon", value: "9", badge: "30 days", note: "Requires Attention", icon: "fa-calendar-days", tone: "sky" },
];

const recentPrescriptions = [
  ["Alberto Ripley", "#PR455698", "Amoxicillin 250mg", "Dr. Michael Smith", "Pending", "Dispense", "AR"],
  ["Susan Babin", "#PR455699", "Paracetamol 500mg", "Dr. Sarah Patel", "Dispensed", "View", "SB"],
  ["Carol Lam", "#PR455700", "Ibuprofen 400mg", "Dr. Michael Smith", "Out of Stock", "View", "CL"],
  ["John Elsass", "#PR455618", "Paracetamol 500mg", "Dr. Rachel Green", "Pending", "Dispense", "JE"],
];
const expiryAlerts = [["Amoxicillin 250mg", "Batch #AX2201", "5 Days", "critical"], ["Cough Syrup 100ml", "Batch #CS0091", "14 Days", "warning"], ["Insulin Vials", "Batch #IN0045", "28 Days", "safe"], ["Ibuprofen", "Batch #IN0042", "12 Days", "warning"]];
const lowStockMedicines = [["Paracetamol 500mg", "Tablet", "24", "50", "MedSupply Co."], ["Amoxicillin 250mg", "Capsule", "12", "40", "PharmaCare Ltd."], ["Ibuprofen 400mg", "Tablet", "8", "30", "MedSupply Co."]];
const topSellingMedicines = [["Paracetamol 500mg", "312 units", 100], ["Amoxicillin 250mg", "245 units", 78], ["Cough Syrup 100ml", "198 units", 63], ["Ibuprofen 400mg", "164 units", 52], ["Insulin Vials", "96 units", 31]];
const suppliers = [["MedSupply Co.", "18 orders this month", "On Time", "on-time"], ["PharmaCare Ltd.", "11 orders this month", "Delayed", "delayed"], ["Wellness Distributors", "7 orders this month", "On Time", "on-time"], ["Pharma Distributors", "5 orders this month", "Delayed", "delayed"]];

function Dashboard() {
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);
  const [period, setPeriod] = useState("This Week");

  const selectPeriod = (value) => {
    setPeriod(value);
    setIsPeriodMenuOpen(false);
  };

  return (
    <section className="dashboard-page">
      <header className="dashboard-header">
        <h1>Pharmacist Dashboard</h1>
        <div className="dashboard-buttons">
          <button type="button" className="purchase-btn" onClick={() => (window.location.href = "/purchase-orders")}>
            <i className="fa-solid fa-plus" aria-hidden="true" /> New Purchase Order
          </button>
          <button type="button" className="stock-btn" onClick={() => (window.location.href = "/stock-management")}>
            <i className="fa-solid fa-boxes-stacked" aria-hidden="true" /> Manage Stock
          </button>
        </div>
      </header>

      <div className="dashboard-cards">
        {summaryCards.map((card) => (
          <article className="dashboard-card" key={card.label}>
            <div>
              <p className="stat-label">{card.label}</p>
              <div className="stat-value-row">
                <strong>{card.value}</strong>
                <span className={`stat-badge ${card.tone}`}>{card.badge}</span>
              </div>
            </div>
            <span className={`stat-icon ${card.tone}`} aria-hidden="true"><i className={`fa-solid ${card.icon}`} /></span>
            <p className="stat-note">{card.note}</p>
          </article>
        ))}
      </div>

      <div className="dashboard-chart-grid">
        <article className="dashboard-panel sales-panel">
          <div className="panel-header">
            <h2>Medicine Sales Trend</h2>
            <div className="chart-filter">
              <button type="button" className="filter-button" onClick={() => setIsPeriodMenuOpen((open) => !open)} aria-expanded={isPeriodMenuOpen}>
                {period} <i className={`fa-solid fa-chevron-${isPeriodMenuOpen ? "up" : "down"}`} aria-hidden="true" />
              </button>
              {isPeriodMenuOpen && (
                <div className="dropdown-menu">
                  {Object.keys(salesByPeriod).map((option) => (
                    <button type="button" key={option} onClick={() => selectPeriod(option)}>{option}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="sales-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={salesByPeriod[period]} margin={{ top: 28, right: 22, left: -12, bottom: 4 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#677285", fontSize: 13 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#677285", fontSize: 13 }} />
                <Tooltip cursor={{ fill: "rgba(67, 86, 216, 0.05)" }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: "18px", fontSize: "13px" }} />
                <Bar dataKey="units" name="Units Sold" fill="#4a9b8f" barSize={38} />
                <Line type="monotone" dataKey="revenue" name="Revenue ($00s)" stroke="#4356d8" strokeWidth={3} dot={{ r: 3, fill: "#4356d8" }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="dashboard-panel stock-panel">
          <div className="panel-header"><h2>Stock by Category</h2></div>
          <div className="stock-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stockByCategory} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius="54%" outerRadius="79%" paddingAngle={1} stroke="none" label={({ value }) => `${value}.0%`} labelLine={false}>
                  {stockByCategory.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Pie>
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: "13px", bottom: 0 }} />
                <Tooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center-copy" aria-hidden="true">
              <span>Total Stock</span>
              <strong>1,248</strong>
            </div>
          </div>
        </article>
      </div>

      <div className="dashboard-detail-grid">
        <article className="dashboard-panel">
          <div className="panel-header"><h2>Recent Prescriptions</h2><button type="button" className="filter-button">Today <i className="fa-solid fa-chevron-down" /></button></div>
          <div className="table-scroll"><table className="dashboard-table"><thead><tr><th>Patient</th><th>Medicine</th><th>Prescribed By</th><th>Status</th><th /></tr></thead><tbody>
            {recentPrescriptions.map(([patient, id, medicine, doctor, status, action, initials]) => <tr key={id}><td><div className="person-cell"><span className="patient-avatar">{initials}</span><span><strong>{patient}</strong><small>{id}</small></span></div></td><td>{medicine}</td><td>{doctor}</td><td><span className={`status-pill ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td><td><button type="button" className="table-action">{action}</button></td></tr>)}
          </tbody></table></div>
        </article>
        <article className="dashboard-panel">
          <div className="panel-header"><h2>Expiry Alerts</h2></div><div className="expiry-list">
            {expiryAlerts.map(([medicine, batch, days, tone]) => <div className="expiry-item" key={medicine}><span className={`alert-icon ${tone}`}><i className="fa-solid fa-clock" /></span><span className="expiry-copy"><strong>{medicine}</strong><small>{batch}</small></span><span className={`expiry-days ${tone}`}>{days}</span></div>)}
          </div><button type="button" className="panel-link">View All Alerts <i className="fa-solid fa-arrow-right" /></button>
        </article>
      </div>

      <div className="dashboard-detail-grid">
        <article className="dashboard-panel"><div className="panel-header"><h2>Low Stock Medicines</h2><button type="button" className="panel-link inline-link">Manage Stock</button></div><div className="table-scroll"><table className="dashboard-table"><thead><tr><th>Medicine</th><th>Category</th><th>Available Qty</th><th>Reorder Level</th><th>Supplier</th><th /></tr></thead><tbody>{lowStockMedicines.map(([medicine, category, quantity, reorder, supplier]) => <tr key={medicine}><td><strong>{medicine}</strong></td><td>{category}</td><td>{quantity}</td><td>{reorder}</td><td>{supplier}</td><td><button type="button" className="table-action">Reorder</button></td></tr>)}</tbody></table></div></article>
        <article className="dashboard-panel"><div className="panel-header"><h2>Top Selling Medicines</h2></div><div className="top-selling-list">{topSellingMedicines.map(([medicine, units, progress]) => <div className="top-selling-item" key={medicine}><div><strong>{medicine}</strong><span>{units}</span></div><span className="sales-progress"><span style={{ width: `${progress}%` }} /></span></div>)}</div></article>
      </div>

      <article className="dashboard-panel suppliers-panel"><div className="panel-header"><h2>Suppliers Overview</h2><button type="button" className="panel-link inline-link">View All</button></div><div className="suppliers-list">{suppliers.map(([name, orders, status, tone]) => <div className="supplier-item" key={name}><span className="supplier-icon"><i className="fa-solid fa-truck-medical" /></span><span><strong>{name}</strong><small>{orders}</small></span><span className={`supplier-status ${tone}`}>{status}</span><button type="button" className="supplier-more" aria-label={`More options for ${name}`}><i className="fa-solid fa-ellipsis" /></button></div>)}</div></article>
    </section>
  );
}

export default Dashboard;

import React, { useState } from "react";
import "../styles/dashboard.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";


const salesData = [
  { name: "Mon", sales: 120 },
  { name: "Tue", sales: 180 },
  { name: "Wed", sales: 150 },
  { name: "Thu", sales: 220 },
  { name: "Fri", sales: 260 },
  { name: "Sat", sales: 200 },
  { name: "Sun", sales: 240 },
];



 const data = [
    { name: "Tablets", value: 80},
    { name: "Capsules", value: 24},
    { name: "Others", value: 8 },
    {name: "injectables", value: 14},
    {name: "syrups", value: 16}
  ];

const pieColors = ["#0d6efd", "#198754", "#ffc107", "#dc3545", "#6f42c1"];

function Dashboard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Pharmacist Dashboard</h1>

        <div className="dashboard-buttons">
          <button
            type="button"
            className="purchase-btn"
            onClick={() => (window.location.href = "/purchase-orders")}
          >
            New Purchase Order
          </button>

          <button
            type="button"
            className="stock-btn"
            onClick={() => (window.location.href = "/stock-management")}
          >
            Manage Stock
          </button>
        </div>
      </div>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <h5>Total Medicines</h5>
          <h2>1,248</h2>
          <span className="positive">+12%</span>
          <small>In last 7 Days</small>
        </div>

        <div className="dashboard-card">
          <h5>Pending Orders</h5>
          <h2>36</h2>
          <span className="positive">+5%</span>
          <small>Awaiting Fulfillment</small>
        </div>

        <div className="dashboard-card">
          <h5>Low Stock Items</h5>
          <h2>18</h2>
          <span className="positive">+3%</span>
          <small>Need Reordering</small>
        </div>

        <div className="dashboard-card">
          <h5>Expiring Soon</h5>
          <h2>9</h2>
          <span className="days">30 days</span>
          <small>Requires Attention</small>
        </div>
      </div>

      <div className="bar-chart-container">
        <div className="chart-header">
          <h5>Medicine Sales Trend</h5>

          <div className="chart-filter">
            <button type="button" className="filter-button" onClick={() => setOpen(!open)}>
              This Week <span>{open ? "▼" : "▶"}</span>
            </button>

            {open && (
              <div className="dropdown-menu">
                <button type="button">This Week</button>
                <button type="button">This Month</button>
                <button type="button">This Year</button>
              </div>
            )}
          </div>
        </div>

        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={salesData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="sales" fill="#0d6efd" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>





      <div className="pie-chart-container">
        <div className="pie-chart-header">
          <h5>Medicine Distribution</h5>
        </div>

        <div className="pie-chart-wrapper">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={38}
                paddingAngle={2}
                label
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`${entry.name}-${index}`}
                    fill={pieColors[index % pieColors.length]}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ))}
              </Pie>

              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>













    </div>
  );
}

export default Dashboard;


import React from 'react';
import '../styles/Suppliers.css';

const supplierStats = [
  { label: 'Total Suppliers', value: '24', change: '+12%', tone: 'blue', icon: 'fa-truck-medical' },
  { label: 'On-Time Delivery', value: '18', change: '+8%', tone: 'green', icon: 'fa-circle-check' },
  { label: 'Delayed', value: '4', change: '-3%', tone: 'amber', icon: 'fa-clock' },
  { label: 'Avg. Lead Time', value: '5.2d', change: 'Stable', tone: 'sky', icon: 'fa-calendar-days' },
];

const suppliers = [
  {
    name: 'MedSupply Co.',
    contact: 'Alicia Smith',
    category: 'Tablets',
    orders: '18',
    delivery: '96%',
    status: 'On Time',
    tone: 'on-time',
  },
  {
    name: 'PharmaCare Ltd.',
    contact: 'Daniel Reed',
    category: 'Capsules',
    orders: '11',
    delivery: '83%',
    status: 'Delayed',
    tone: 'delayed',
  },
  {
    name: 'Wellness Distributors',
    contact: 'Maria Lee',
    category: 'Syrups',
    orders: '7',
    delivery: '92%',
    status: 'On Time',
    tone: 'on-time',
  },
  {
    name: 'MediPlus',
    contact: 'James Park',
    category: 'Injectables',
    orders: '5',
    delivery: '78%',
    status: 'Delayed',
    tone: 'delayed',
  },
  {
    name: 'Global Pharma',
    contact: 'Emma Clarke',
    category: 'Antibiotics',
    orders: '9',
    delivery: '94%',
    status: 'On Time',
    tone: 'on-time',
  },
  {
    name: 'HealthCare Solutions',
    contact: 'Robert Hall',
    category: 'Supplements',
    orders: '6',
    delivery: '88%',
    status: 'On Time',
    tone: 'on-time',
  },
];

function Suppliers() {
  return (
    <div className="suppliers-page">
      <header className="suppliers-header">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Suppliers</h1>
        </div>
        <button type="button" className="primary-btn">
          <i className="fa-solid fa-plus" /> Add Supplier
        </button>
      </header>

      <section className="stats-grid" aria-label="Supplier summary statistics">
        {supplierStats.map((stat) => (
          <article key={stat.label} className="stat-card">
            <div className="stat-copy">
              <p>{stat.label}</p>
              <div className="stat-row">
                <strong>{stat.value}</strong>
                <span className={`stat-badge ${stat.tone}`}>{stat.change}</span>
              </div>
            </div>
            <span className={`stat-icon ${stat.tone}`}>
              <i className={`fa-solid ${stat.icon}`} />
            </span>
          </article>
        ))}
      </section>

      <section className="suppliers-panel">
        <div className="panel-head">
          <h2>Supplier Overview</h2>
          <button type="button" className="ghost-btn">View All</button>
        </div>

        <div className="table-wrap">
          <table className="suppliers-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Category</th>
                <th>Orders</th>
                <th>Delivery</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.name}>
                  <td>
                    <div className="supplier-meta">
                      <span className="supplier-avatar"><i className="fa-solid fa-truck-medical" /></span>
                      <strong>{supplier.name}</strong>
                    </div>
                  </td>
                  <td>{supplier.contact}</td>
                  <td>{supplier.category}</td>
                  <td>{supplier.orders}</td>
                  <td>{supplier.delivery}</td>
                  <td>
                    <span className={`status-pill ${supplier.tone}`}>{supplier.status}</span>
                  </td>
                  <td>
                    <button type="button" className="table-action">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="page-footer">
        <div className="footer-left">
          <span>© 2025 Preclinic</span>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
        <div className="footer-right">
          <span>Support</span>
          <span>Help Center</span>
        </div>
      </footer>
    </div>
  );
}

export default Suppliers;

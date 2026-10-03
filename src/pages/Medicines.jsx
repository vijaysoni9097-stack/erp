import React from 'react';
import '../styles/Medicines.css';

const summaryCards = [
  { label: 'Total Medicines', value: '1,248', change: '+12%', tone: 'blue', icon: 'fa-capsules' },
  { label: 'Active SKUs', value: '186', change: '+8%', tone: 'green', icon: 'fa-pills' },
  { label: 'Low Stock', value: '18', change: '-3%', tone: 'amber', icon: 'fa-triangle-exclamation' },
  { label: 'Expiring Soon', value: '9', change: '30 days', tone: 'red', icon: 'fa-calendar-days' },
];

const medicines = [
  {
    name: 'Paracetamol 500mg',
    category: 'Tablets',
    batch: 'BTH-2104',
    stock: 245,
    reorderLevel: 50,
    supplier: 'MedSupply Co.',
    expiry: '12 Aug 2026',
    status: 'In Stock',
  },
  {
    name: 'Amoxicillin 250mg',
    category: 'Capsules',
    batch: 'AMX-8841',
    stock: 124,
    reorderLevel: 40,
    supplier: 'PharmaCare Ltd.',
    expiry: '18 Sep 2026',
    status: 'Low Stock',
  },
  {
    name: 'Ibuprofen 400mg',
    category: 'Tablets',
    batch: 'IBU-9912',
    stock: 86,
    reorderLevel: 30,
    supplier: 'MediPlus',
    expiry: '06 Nov 2026',
    status: 'In Stock',
  },
  {
    name: 'Cough Syrup 100ml',
    category: 'Syrups',
    batch: 'CS-0029',
    stock: 32,
    reorderLevel: 20,
    supplier: 'Wellness Dist.',
    expiry: '22 Jul 2026',
    status: 'Low Stock',
  },
  {
    name: 'Insulin Vials',
    category: 'Injectables',
    batch: 'INS-7741',
    stock: 14,
    reorderLevel: 25,
    supplier: 'Global Pharma',
    expiry: '14 Sep 2026',
    status: 'Critical',
  },
  {
    name: 'Vitamin C 1000mg',
    category: 'Capsules',
    batch: 'VIT-1804',
    stock: 210,
    reorderLevel: 60,
    supplier: 'HealthCare Sol.',
    expiry: '09 Jan 2027',
    status: 'In Stock',
  },
];

const filterChips = ['All Categories', 'Tablets', 'Capsules', 'Syrups', 'Injectables'];

function Medicines() {
  return (
    <div className="medicines-page">
      <header className="medicines-header">
        <div>
          <p className="eyebrow">Pharmacy Inventory</p>
          <h1>Medicines</h1>
        </div>

        <div className="header-actions">
          <button type="button" className="secondary-btn">
            <i className="fa-solid fa-download" /> Export
          </button>
          <button type="button" className="primary-btn">
            <i className="fa-solid fa-plus" /> Add Medicine
          </button>
        </div>
      </header>

      <section className="summary-grid" aria-label="Medicine summary statistics">
        {summaryCards.map((card) => (
          <article key={card.label} className="summary-card">
            <div className="summary-copy">
              <p>{card.label}</p>
              <div className="summary-row">
                <strong>{card.value}</strong>
                <span className={`summary-badge ${card.tone}`}>{card.change}</span>
              </div>
            </div>
            <span className={`summary-icon ${card.tone}`}>
              <i className={`fa-solid ${card.icon}`} />
            </span>
          </article>
        ))}
      </section>

      <section className="medicines-toolbar">
        <div className="search-box">
          <i className="fa-solid fa-magnifying-glass" />
          <input type="text" placeholder="Search medicine, batch or supplier" />
        </div>

        <div className="toolbar-actions">
          <button type="button" className="filter-button active">All Categories</button>
          <button type="button" className="filter-button">Low Stock</button>
          <button type="button" className="filter-button">Expiring Soon</button>
        </div>
      </section>

      <section className="medicines-panel">
        <div className="panel-head">
          <div>
            <h2>Medicine Inventory</h2>
          </div>

          <div className="panel-head-actions">
            <button type="button" className="ghost-btn">Filter</button>
            <button type="button" className="ghost-btn">View</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="medicines-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Reorder</th>
                <th>Supplier</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {medicines.map((item) => (
                <tr key={item.batch}>
                  <td>
                    <div className="medicine-name-cell">
                      <span className="medicine-avatar">
                        {item.name
                          .split(' ')
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <div className="medicine-meta">
                        <strong>{item.name}</strong>
                        <small>{item.batch}</small>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className={`category-pill ${item.category.toLowerCase()}`}>
                      {item.category}
                    </span>
                  </td>

                  <td>{item.stock}</td>
                  <td>{item.reorderLevel}</td>
                  <td>{item.supplier}</td>
                  <td>{item.expiry}</td>
                  <td>
                    <span className={`status-pill ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="table-action">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Medicines;

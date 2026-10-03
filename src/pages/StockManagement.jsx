import React from 'react';
import '../styles/StockManagement.css';

const stockData = [
  { item: 'Paracetamol 500mg', category: 'Tablets', stock: '245', reorder: '50', supplier: 'MedSupply Co.', status: 'Healthy' },
  { item: 'Amoxicillin 250mg', category: 'Capsules', stock: '124', reorder: '40', supplier: 'PharmaCare Ltd.', status: 'Low Stock' },
  { item: 'Ibuprofen 400mg', category: 'Tablets', stock: '86', reorder: '30', supplier: 'MediPlus', status: 'Low Stock' },
  { item: 'Cough Syrup 100ml', category: 'Syrups', stock: '32', reorder: '20', supplier: 'Wellness Dist.', status: 'Low Stock' },
  { item: 'Insulin Vials', category: 'Injectables', stock: '14', reorder: '25', supplier: 'Global Pharma', status: 'Critical' },
];

const stats = [
  { label: 'Total Stock Units', value: '1,248', change: '+12%', tone: 'blue', icon: 'fa-cubes' },
  { label: 'Healthy Stock', value: '936', change: '+8%', tone: 'green', icon: 'fa-circle-check' },
  { label: 'Low Stock', value: '18', change: '+3%', tone: 'amber', icon: 'fa-triangle-exclamation' },
  { label: 'Critical', value: '9', change: '30 days', tone: 'red', icon: 'fa-bell' },
];

function StockManagement() {
  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Stock Management</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-btn">Export</button>
          <button type="button" className="primary-btn"><i className="fa-solid fa-plus" /> Add Stock</button>
        </div>
      </header>

      <section className="summary-grid" aria-label="Stock summary">
        {stats.map((card) => (
          <article key={card.label} className="summary-card">
            <div className="summary-copy">
              <p>{card.label}</p>
              <div className="summary-row">
                <strong>{card.value}</strong>
                <span className={`summary-badge ${card.tone}`}>{card.change}</span>
              </div>
            </div>
            <span className={`summary-icon ${card.tone}`}><i className={`fa-solid ${card.icon}`} /></span>
          </article>
        ))}
      </section>

      <section className="inventory-panel">
        <div className="panel-head">
          <h2>Stock Inventory</h2>
          <div className="panel-head-actions">
            <button type="button" className="ghost-btn">Filter</button>
            <button type="button" className="ghost-btn">Manage Stock</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Category</th>
                <th>Current Qty</th>
                <th>Reorder Level</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((item) => (
                <tr key={item.item}>
                  <td><strong>{item.item}</strong></td>
                  <td>{item.category}</td>
                  <td>{item.stock}</td>
                  <td>{item.reorder}</td>
                  <td>{item.supplier}</td>
                  <td><span className={`status-pill ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status}</span></td>
                  <td><button type="button" className="table-action">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default StockManagement;

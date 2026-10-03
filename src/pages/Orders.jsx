import React from 'react';
import '../styles/Orders.css';

const summaryCards = [
  { label: 'Total Orders', value: '312', change: '+12%', tone: 'blue', icon: 'fa-shopping-cart' },
  { label: 'Pending Approval', value: '42', change: '+5%', tone: 'amber', icon: 'fa-clock' },
  { label: 'In Transit', value: '18', change: '+3%', tone: 'green', icon: 'fa-truck' },
  { label: 'Delivered', value: '245', change: '+9%', tone: 'sky', icon: 'fa-box-check' },
];

const orders = [
  {
    id: '#PO-3400',
    supplier: 'PharmaCare Ltd.',
    product: 'Amoxicillin 250mg x 300',
    date: '26 May 2025',
    status: 'Pending',
    amount: '$860',
    priority: 'High',
  },
  {
    id: '#PO-3399',
    supplier: 'GlaxoSmith Pharma',
    product: 'Ibuprofen 400mg x 800',
    date: '24 May 2025',
    status: 'Approved',
    amount: '$2,100',
    priority: 'Normal',
  },
  {
    id: '#PO-3398',
    supplier: 'MedSupply Co.',
    product: 'Insulin Vials x 100',
    date: '22 May 2025',
    status: 'In Transit',
    amount: '$1,850',
    priority: 'Urgent',
  },
  {
    id: '#PO-3397',
    supplier: 'Wellness Distributors',
    product: 'Cough Syrup 100ml x 200',
    date: '20 May 2025',
    status: 'Delivered',
    amount: '$640',
    priority: 'Normal',
  },
  {
    id: '#PO-3396',
    supplier: 'MediPharm Inc.',
    product: 'Aspirin 500mg x 500',
    date: '18 May 2025',
    status: 'Rejected',
    amount: '$420',
    priority: 'Low',
  },
  {
    id: '#PO-3395',
    supplier: 'HealthCare Solutions',
    product: 'Vitamin C 1000mg x 100',
    date: '16 May 2025',
    status: 'Pending',
    amount: '$280',
    priority: 'Normal',
  },
  {
    id: '#PO-3394',
    supplier: 'Global Pharma',
    product: 'Antibiotic Tabs x 1000',
    date: '14 May 2025',
    status: 'Approved',
    amount: '$1,560',
    priority: 'High',
  },
  {
    id: '#PO-3393',
    supplier: 'MediHub',
    product: 'Injectable 10ml x 50',
    date: '12 May 2025',
    status: 'Delivered',
    amount: '$950',
    priority: 'Urgent',
  },
];

function Orders() {
  return (
    <div className="orders-page">
      <header className="orders-header">
        <div>
          <p className="eyebrow">Procurement</p>
          <h1>Purchase Orders</h1>
        </div>

        <button type="button" className="primary-btn">
          <i className="fa-solid fa-plus" /> New Purchase Order
        </button>
      </header>

      <section className="summary-grid" aria-label="Purchase order overview">
        {summaryCards.map((card) => (
          <article className="summary-card" key={card.label}>
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

      <section className="orders-panel">
        <div className="panel-head">
          <h2>Purchase Order List</h2>

          <div className="panel-head-actions">
            <button type="button" className="ghost-btn">Filter</button>
            <button type="button" className="ghost-btn">Export</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>PO ID</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Date</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="po-id">{order.id}</td>
                  <td>{order.supplier}</td>
                  <td>{order.product}</td>
                  <td>{order.date}</td>
                  <td>
                    <span className={`status-pill ${order.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <span className={`priority-pill ${order.priority.toLowerCase()}`}>{order.priority}</span>
                  </td>
                  <td className="amount-cell">{order.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Orders;

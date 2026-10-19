import React from 'react';
import '../styles/dashboard.css';
import '../styles/PurchaseOrders.css';

const PurchaseOrders = () => {
  const purchaseOrders = [
    { id: '#PO-3400', supplier: 'PharmaCare Ltd.', product: 'Amoxicillin 250mg x 300', date: '26 May 2025', price: '$860' },
    { id: '#PO-3399', supplier: 'GlaxoSmith Pharma', product: 'Ibuprofen 400mg x 800', date: '24 May 2025', price: '$2,100' },
    { id: '#PO-3398', supplier: 'MedSupply Co.', product: 'Insulin Vials x 100', date: '22 May 2025', price: '$1,850' },
    { id: '#PO-3397', supplier: 'Wellness Distributors', product: 'Cough Syrup 100ml x 200', date: '20 May 2025', price: '$640' },
    { id: '#PO-3396', supplier: 'MediPharm Inc.', product: 'Aspirin 500mg x 500', date: '18 May 2025', price: '$420' },
    { id: '#PO-3395', supplier: 'HealthCare Solutions', product: 'Vitamin C 1000mg x 100', date: '16 May 2025', price: '$280' },
    { id: '#PO-3394', supplier: 'Global Pharma', product: 'Antibiotic Tabs x 1000', date: '14 May 2025', price: '$1,560' },
    { id: '#PO-3393', supplier: 'MediHub', product: 'Injectable 10ml x 50', date: '12 May 2025', price: '$950' },
  ];

  const stats = [
    { title: 'Pending Approval', value: '6', icon: 'hourglass', tone: 'yellow' },
    { title: 'In Transit', value: '9', icon: 'truck', tone: 'sky' },
    { title: 'Delivered This Month', value: '36', icon: 'check-circle', tone: 'green' },
    { title: 'Total Spend (MTD)', value: '$18,420', icon: 'dollar-sign', tone: 'blue' },
  ];

  return (
    <section className="dashboard-page purchase-orders-page">
      <header className="dashboard-header">
        <div className="purchase-orders-title">
          <h1>Purchase Orders</h1>
          <span className="purchase-orders-count">312 total orders</span>
        </div>
        <div className="dashboard-buttons">
          <button type="button" className="purchase-btn"><i className="fa-solid fa-plus" aria-hidden="true" /> New Purchase Order</button>
        </div>
      </header>

      <section className="dashboard-cards" aria-label="Purchase order summary">
        {stats.map(stat => (
          <article className="dashboard-card" key={stat.title}>
            <p className="stat-label">{stat.title}</p>
            <div className="stat-value-row"><strong>{stat.value}</strong></div>
            <span className={`stat-icon ${stat.tone}`}><i className={`fa-solid fa-${stat.icon}`} aria-hidden="true" /></span>
          </article>
        ))}
      </section>

      <section className="dashboard-panel" aria-labelledby="purchase-order-list-title">
        <div className="panel-header">
          <h2 id="purchase-order-list-title">Purchase Order List</h2>
          <span className="purchase-orders-list-count">{purchaseOrders.length} orders shown</span>
        </div>
        <div className="table-scroll">
          <table className="dashboard-table purchase-orders-table" aria-label="Purchase orders">
            <thead><tr><th scope="col">PO ID</th><th scope="col">Supplier</th><th scope="col">Product</th><th scope="col">Date</th><th scope="col" className="purchase-orders-price">Price</th></tr></thead>
            <tbody>{purchaseOrders.map(order => (
              <tr key={order.id}>
                <td><strong>{order.id}</strong></td>
                <td>{order.supplier}</td>
                <td>{order.product}</td>
                <td>{order.date}</td>
                <td className="purchase-orders-price"><strong>{order.price}</strong></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default PurchaseOrders;

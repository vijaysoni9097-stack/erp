import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/PurchaseOrders.css';

const PurchaseOrders = () => {
  const [purchaseOrders, setPurchaseOrders] = useState([
    { id: '#PO-3400', supplier: 'PharmaCare Ltd.', product: 'Amoxicillin 250mg x 300', date: '26 May 2025', price: '$860' },
    { id: '#PO-3399', supplier: 'GlaxoSmith Pharma', product: 'Ibuprofen 400mg x 800', date: '24 May 2025', price: '$2,100' },
    { id: '#PO-3398', supplier: 'MedSupply Co.', product: 'Insulin Vials x 100', date: '22 May 2025', price: '$1,850' },
    { id: '#PO-3397', supplier: 'Wellness Distributors', product: 'Cough Syrup 100ml x 200', date: '20 May 2025', price: '$640' },
    { id: '#PO-3396', supplier: 'MediPharm Inc.', product: 'Aspirin 500mg x 500', date: '18 May 2025', price: '$420' },
    { id: '#PO-3395', supplier: 'HealthCare Solutions', product: 'Vitamin C 1000mg x 100', date: '16 May 2025', price: '$280' },
    { id: '#PO-3394', supplier: 'Global Pharma', product: 'Antibiotic Tabs x 1000', date: '14 May 2025', price: '$1,560' },
    { id: '#PO-3393', supplier: 'MediHub', product: 'Injectable 10ml x 50', date: '12 May 2025', price: '$950' },
  ]);

  const stats = [
    { title: 'Pending Approval', value: '6', icon: 'hourglass' },
    { title: 'In Transit', value: '9', icon: 'truck' },
    { title: 'Delivered This Month', value: '36', icon: 'check-circle' },
    { title: 'Total Spend (MTD)', value: '$18,420', icon: 'dollar-sign' },
  ];

  return (
    <div className="purchase-orders-container">
      {/* Header */}
      <div className="purchase-orders-header">
        <div className="header-title-section">
          <h1>Purchase Orders</h1>
          <span className="badge bg-primary">Total Orders : 312</span>
        </div>
        <button className="btn btn-primary btn-lg">
          <i className="fas fa-plus"></i> New Purchase Order
        </button>
      </div>

      {/* Stats Cards */}
      <div className="stats-container">
        <div className="row g-4">
          {stats.map((stat, index) => (
            <div key={index} className="col-md-6 col-lg-3">
              <div className="stat-card">
                <div className="stat-content">
                  <h6 className="stat-title">{stat.title}</h6>
                  <h2 className="stat-value">{stat.value}</h2>
                </div>
                <div className="stat-icon-box">
                  <i className={`fas fa-${stat.icon}`}></i>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="table-container">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>PO ID</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Date</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((order) => (
                <tr key={order.id}>
                  <td className="po-id">{order.id}</td>
                  <td className="supplier">{order.supplier}</td>
                  <td className="product">{order.product}</td>
                  <td className="date">{order.date}</td>
                  <td className="price">{order.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrders;

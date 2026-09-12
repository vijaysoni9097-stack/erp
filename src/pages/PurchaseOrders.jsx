import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/PurchaseOrders.css';


const PurchaseOrders = () => {
  const [purchaseOrders, setPurchaseOrders] = useState([
    { id: 'PO-3400', supplier: 'Medico Supplies', product: 'Medications', date: '2024-09-12', status: 'Delivered' },
    { id: 'PO-3399', supplier: 'Drug Distributor', product: 'Antibiotics', date: '2024-09-11', status: 'Delivered' },
    { id: 'PO-3398', supplier: 'Pharma Ltd', product: 'Vitamins', date: '2024-09-10', status: 'In Transit' },
    { id: 'PO-3397', supplier: 'Health Solutions', product: 'Injectable', date: '2024-09-09', status: 'In Transit' },
    { id: 'PO-3396', supplier: 'Medical Hub', product: 'Capsules', date: '2024-09-08', status: 'Pending Approval' },
    { id: 'PO-3395', supplier: 'Drugs Direct', product: 'Syrup', date: '2024-09-07', status: 'Delivered' },
    { id: 'PO-3394', supplier: 'Pharma Plus', product: 'Tablets', date: '2024-09-06', status: 'Delivered' },
    { id: 'PO-3393', supplier: 'Medical Care', product: 'Ointments', date: '2024-09-05', status: 'In Transit' },
  ]);

  const stats = [
    { title: 'Pending Approval', value: '6', color: 'warning' },
    { title: 'In Transit', value: '9', color: 'info' },
    { title: 'Delivered This Month', value: '36', color: 'success' },
    { title: 'Total Spend (MTD)', value: '$18,420', color: 'danger' },
  ];

  return (
    <div className="purchase-orders-container">
      {/* Header */}
      <div className="purchase-orders-header">
        <div className="header-title-section">
          <h1>Purchase Orders</h1>
          <span className="badge bg-primary">Total Orders: 312</span>
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
              <div className={`stat-card bg-${stat.color} bg-opacity-10`}>
                <div className="stat-header">
                  <span className={`stat-icon bg-${stat.color}`}>
                    {stat.color === 'warning' && <i className="fas fa-hourglass"></i>}
                    {stat.color === 'info' && <i className="fas fa-truck"></i>}
                    {stat.color === 'success' && <i className="fas fa-check-circle"></i>}
                    {stat.color === 'danger' && <i className="fas fa-dollar-sign"></i>}
                  </span>
                  <h6>{stat.title}</h6>
                </div>
                <h3>{stat.value}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="table-container">
        <div className="table-header">
          <h5>Recent Purchase Orders</h5>
          <div className="table-controls">
            <input type="text" className="form-control" placeholder="Search..." style={{ width: '200px' }} />
            <select className="form-select" style={{ width: '150px' }}>
              <option>All Status</option>
              <option>Pending Approval</option>
              <option>In Transit</option>
              <option>Delivered</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>PO ID</th>
                <th>Supplier</th>
                <th>Product</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.id}</strong></td>
                  <td>{order.supplier}</td>
                  <td>{order.product}</td>
                  <td>{order.date}</td>
                  <td>
                    <span className={`badge bg-${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline-primary me-2">Edit</button>
                    <button className="btn btn-sm btn-outline-danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>Showing 1 to 8 of 312 entries</span>
          <nav>
            <ul className="pagination">
              <li className="page-item disabled"><a className="page-link" href="#">Previous</a></li>
              <li className="page-item active"><a className="page-link" href="#">1</a></li>
              <li className="page-item"><a className="page-link" href="#">2</a></li>
              <li className="page-item"><a className="page-link" href="#">3</a></li>
              <li className="page-item"><a className="page-link" href="#">Next</a></li>
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
};

const getStatusColor = (status) => {
  switch (status) {
    case 'Pending Approval': return 'warning';
    case 'In Transit': return 'info';
    case 'Delivered': return 'success';
    default: return 'secondary';
  }
};

export default PurchaseOrders;

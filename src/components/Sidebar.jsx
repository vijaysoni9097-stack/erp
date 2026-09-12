import React from 'react';
import '../styles/Sidebar.css';

const Sidebar = ({ isOpen }) => {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <h3>Preclinic</h3>
      </div>
      
      <nav className="sidebar-nav">
        <ul>
          <li>
            <a href="#dashboard" className="nav-link">
              <i className="fas fa-chart-pie"></i>
              <span>Dashboard</span>
            </a>
          </li>
          <li>
            <a href="#purchase-orders" className="nav-link active">
              <i className="fas fa-shopping-cart"></i>
              <span>Purchase Orders</span>
            </a>
          </li>
          <li>
            <a href="#inventory" className="nav-link">
              <i className="fas fa-warehouse"></i>
              <span>Inventory</span>
            </a>
          </li>
          <li>
            <a href="#suppliers" className="nav-link">
              <i className="fas fa-building"></i>
              <span>Suppliers</span>
            </a>
          </li>
          <li>
            <a href="#reports" className="nav-link">
              <i className="fas fa-file-alt"></i>
              <span>Reports</span>
            </a>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;

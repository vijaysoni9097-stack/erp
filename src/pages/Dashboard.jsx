import React from "react";
import "../styles/dashboard.css";

function Dashboard() {
  return (
    <div className="dashboard-page">

      <div className="dashboard-header">

        <h1>Pharmacist Dashboard</h1>

        <div className="dashboard-buttons">
          <button className="purchase-btn">
            New Purchase Order
          </button>

          <button className="stock-btn">
            Manage Stock
          </button>
        </div>

      </div>

                                                   /* Dashboard Cards */


<div className="dashboard-cards">

 
  <div className="dashboard-card">
    <p>Total Medicines</p>
    <h2>1,248</h2>
    <span className="positive">+12%</span>
    <small>In last 7 Days</small>
  </div>



  <div className="dashboard-card">
    <p>Pending Orders</p>
    <h2>36</h2>
    <span className="positive">+5%</span>
    <small>Awaiting Fulfillment</small>
  </div>


 
  <div className="dashboard-card">
    <p>Low Stock Items</p>
    <h2>18</h2>
    <span className="positive">+3%</span>
    <small>Need Reordering</small>
  </div>



  <div className="dashboard-card">
    <p>Expiring Soon</p>
    <h2>9</h2>
    <span className="days">30 days</span>
    <small>Requires Attention</small>
  </div>

</div>



    </div>
  );
}

export default Dashboard;


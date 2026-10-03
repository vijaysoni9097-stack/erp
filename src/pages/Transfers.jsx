import React from 'react';
import '../styles/Transfers.css';

const transfers = [
  { id: '#TR-1032', from: 'Main Warehouse', to: 'Pharmacy Store', date: '12 Jun 2025', status: 'Completed', qty: '120 units' },
  { id: '#TR-1031', from: 'City Clinic', to: 'Main Warehouse', date: '10 Jun 2025', status: 'In Transit', qty: '90 units' },
  { id: '#TR-1030', from: 'Branch A', to: 'Pharmacy Store', date: '08 Jun 2025', status: 'Pending', qty: '150 units' },
  { id: '#TR-1029', from: 'Main Warehouse', to: 'Branch B', date: '06 Jun 2025', status: 'Completed', qty: '80 units' },
];

function Transfers() {
  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Transfers</h1>
        </div>
        <button type="button" className="primary-btn"><i className="fa-solid fa-right-left" /> New Transfer</button>
      </header>

      <section className="transfers-panel">
        <div className="panel-head">
          <h2>Transfer Logs</h2>
          <button type="button" className="ghost-btn">Filter</button>
        </div>

        <div className="table-wrap">
          <table className="transfers-table">
            <thead>
              <tr>
                <th>Transfer ID</th>
                <th>From</th>
                <th>To</th>
                <th>Date</th>
                <th>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.id}</strong></td>
                  <td>{item.from}</td>
                  <td>{item.to}</td>
                  <td>{item.date}</td>
                  <td>{item.qty}</td>
                  <td><span className={`status-pill ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Transfers;

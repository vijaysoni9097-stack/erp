import React from 'react';
import '../styles/ExpiryAlerts.css';

const alerts = [
  { item: 'Amoxicillin 250mg', batch: 'Batch #AX2201', days: '5 Days', tone: 'critical' },
  { item: 'Cough Syrup 100ml', batch: 'Batch #CS0091', days: '14 Days', tone: 'warning' },
  { item: 'Insulin Vials', batch: 'Batch #IN0045', days: '28 Days', tone: 'safe' },
  { item: 'Ibuprofen', batch: 'Batch #IN0042', days: '12 Days', tone: 'warning' },
  { item: 'Vitamin C 1000mg', batch: 'Batch #VIT002', days: '21 Days', tone: 'safe' },
];

function ExpiryAlerts() {
  return (
    <div className="inventory-page">
      <header className="inventory-header">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Expiry Alerts</h1>
        </div>
        <button type="button" className="primary-btn">Review All</button>
      </header>

      <section className="alerts-panel">
        <div className="panel-head">
          <h2>Medicine Expiry List</h2>
          <button type="button" className="ghost-btn">This Month</button>
        </div>

        <div className="alerts-list">
          {alerts.map((item) => (
            <div key={`${item.item}-${item.batch}`} className="alert-row">
              <span className={`alert-icon ${item.tone}`}><i className="fa-solid fa-clock" /></span>
              <div className="alert-copy">
                <strong>{item.item}</strong>
                <small>{item.batch}</small>
              </div>
              <span className={`expiry-badge ${item.tone}`}>{item.days}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default ExpiryAlerts;

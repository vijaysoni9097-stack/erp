import React, { useState } from 'react';
import '../styles/Navbar.css';

const Navbar = ({ onToggleSidebar }) => {
  return (
    <nav className="navbar-top">
      <div className="navbar-content">
        <button className="navbar-toggle" onClick={onToggleSidebar}>
          <i className="fas fa-bars"></i>
        </button>

        <div className="navbar-actions">
          <button className="navbar-action-btn">
            <i className="fas fa-search"></i>
          </button>
          <button className="navbar-action-btn">
            <i className="fas fa-cog"></i>
          </button>
          <button className="navbar-action-btn">
            <i className="fas fa-moon"></i>
          </button>
          <button className="navbar-action-btn notification-btn">
            <i className="fas fa-bell"></i>
            <span className="notification-badge">1</span>
          </button>
          <div className="navbar-profile">
            <img 
              src="https://ui-avatars.com/api/?name=Pharmacist&background=FF6B6B&color=fff" 
              alt="Profile" 
              className="profile-avatar"
            />
            <span className="profile-status"></span>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

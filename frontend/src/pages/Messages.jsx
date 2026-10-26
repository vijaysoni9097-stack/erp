import React from 'react';
import '../styles/Messages.css';

const conversations = [
  {
    id: 1,
    name: 'Alberto Ripley',
    time: '10:24 AM',
    preview: 'Follow-up on the prescription update',
    unread: 2,
    avatar: 'AR',
    tone: 'blue',
    active: true,
  },
  {
    id: 2,
    name: 'Susan Babin',
    time: '9:48 AM',
    preview: 'New stock request approved',
    unread: 0,
    avatar: 'SB',
    tone: 'pink',
    active: false,
  },
  {
    id: 3,
    name: 'Carol Lam',
    time: 'Yesterday',
    preview: 'Prescription notes attached',
    unread: 1,
    avatar: 'CL',
    tone: 'green',
    active: false,
  },
  {
    id: 4,
    name: 'John Elsass',
    time: 'Mon',
    preview: 'Admin request regarding refill',
    unread: 0,
    avatar: 'JE',
    tone: 'orange',
    active: false,
  },
];

const threads = [
  {
    title: 'Prescription follow-up',
    text: 'Please review the updated medicine list before 2 PM.',
  },
  {
    title: 'Inventory request',
    text: 'We need 20 additional units of Amoxicillin 250mg.',
  },
];

const chatMessages = [
  {
    sender: 'incoming',
    text: 'Hi, I wanted to confirm the refill for Amoxicillin 250mg. Can you confirm if the stock is available?',
    time: '10:20 AM',
  },
  {
    sender: 'outgoing',
    text: 'Yes, we have enough stock available. I also updated the reorder level for this item.',
    time: '10:22 AM',
  },
  {
    sender: 'incoming',
    text: 'Perfect. Please also attach the latest prescription note when you can.',
    time: '10:24 AM',
  },
];

function Messages() {
  return (
    <div className="messages-page">
      <div className="messages-shell">
        <aside className="messages-sidebar">
          <div className="messages-header">
            <h1>Messages</h1>
            <button type="button" className="primary-btn">New Chat</button>
          </div>

          <div className="search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input type="text" placeholder="Search messages" />
          </div>

          <div className="filter-row">
            <button type="button" className="filter-btn active">All</button>
            <button type="button" className="filter-btn">Unread</button>
            <button type="button" className="filter-btn">Pinned</button>
          </div>

          <div className="chat-list">
            {conversations.map((chat) => (
              <div key={chat.id} className={`chat-item ${chat.active ? 'active' : ''}`}>
                <div className={`avatar ${chat.tone}`}>{chat.avatar}</div>

                <div className="chat-main">
                  <div className="chat-top">
                    <strong>{chat.name}</strong>
                    <span className="chat-time">{chat.time}</span>
                  </div>
                  <div className="chat-preview">
                    <span>{chat.preview}</span>
                  </div>
                </div>

                {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
              </div>
            ))}
          </div>
        </aside>

        <main className="conversation-panel">
          <div className="conversation-head">
            <button type="button" className="user-pill">
              <span className="avatar blue">AR</span>
              <span>
                <strong>Alberto Ripley</strong>
                <small>Online now</small>
              </span>
            </button>

            <div className="nav-actions">
              <button type="button" className="icon-button" aria-label="Call"><i className="fa-solid fa-phone" /></button>
              <button type="button" className="icon-button" aria-label="Video"><i className="fa-solid fa-video" /></button>
              <button type="button" className="icon-button" aria-label="More"><i className="fa-solid fa-ellipsis" /></button>
            </div>
          </div>

          <div className="message-list">
            {chatMessages.map((message, index) => (
              <div key={`${message.sender}-${index}`} className={`chat-row ${message.sender}`}>
                <div className="message-bubble">{message.text}</div>
              </div>
            ))}

            <div className="message-popup">
              <div>
                <strong>Prescription follow-up</strong>
                <span>Please review the updated medicine list before 2 PM.</span>
              </div>
              <button type="button" className="thread-action">View thread</button>
            </div>
          </div>

          <div className="conversation-input">
            <div className="input-wrap">
              <i className="fa-solid fa-paperclip" style={{ color: '#6d7a8d', marginRight: 10 }} />
              <input type="text" placeholder="Type a message..." />
            </div>
            <button type="button" className="send-button">Send Message</button>
          </div>
        </main>
      </div>

      <footer className="footer">
        <div className="footer-left">
          <span>© 2025 Preclinic</span>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>

        <div className="footer-right">
          <span>Support</span>
          <span>Help Center</span>
        </div>
      </footer>
    </div>
  );
}

export default Messages;

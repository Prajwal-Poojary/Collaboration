# 🌌 Void - The Future of Connection

> **Premium Real-Time Video Conferencing & AI Collaboration Platform**

![Project Banner](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop)

**Void** is a state-of-the-art video conferencing application designed for immersive collaboration. It features a stunning "Deep Space" glassmorphism UI, real-time AI transcription, and seamless screen sharing, all built on a robust full-stack architecture.

---

## 🚀 Features at a Glance

*   **💎 Extraordinary UI/UX**: A "Deep Space & Neon" aesthetic with advanced glassmorphism, floating animations, and `framer-motion` interactions.
*   **🎥 HD Video Conferencing**: Low-latency mesh network WebRTC for crystal clear peer-to-peer communication.
*   **🤖 AI-Powered**: Integrated Python AI service providing real-time meeting transcription and summarization.
*   **💬 Real-Time Chat**: Socket.IO powered instant messaging with a sleek overlay interface.
*   **🖥️ Seamless Screen Sharing**: One-click screen sharing to collaborate on documents and code.
*   **🔒 Secure Authentication**: JWT-based secure login and registration system.

---

## 🛠️ Tech Stack

### **Frontend** (Client)
*   **Framework**: React 19 + TypeScript
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS v4 + Vanilla CSS Variables (Theming)
*   **Animations**: Framer Motion
*   **Real-time**: Socket.IO Client + WebRTC (Mesh)

### **Backend** (Server)
*   **Runtime**: Node.js + Express
*   **Database**: MongoDB (Mongoose)
*   **Auth**: JWT (JSON Web Tokens)
*   **Communication**: Socket.IO (Signaling & Chat)

### **AI Service**
*   **Lang**: Python 3.8+
*   **Framework**: Flask
*   **Libraries**: SpeechRecognition, Transformers

---

## 🏁 Getting Started

We have simplified the setup process into a **single command**.

### Prerequisites
*   Node.js (v18+)
*   Python (3.8+)
*   MongoDB Instance (Local or Atlas)

### 1️⃣ Installation

Clone the repository and install **all** dependencies (Frontend, Backend, and AI Service) with one command:

```bash
npm install
npm run install-all
```

*(Note: `npm run install-all` will automatically `npm install` for client/server and `pip install` for ai-service)*

### 2️⃣ Environment Setup

Create a `.env` file in the `server` directory:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
PORT=5000
```

### 3️⃣ Launch 🚀

Start the entire platform (Client, Server, and AI) simultaneously:

```bash
npm start
```

*   **Frontend**: [http://localhost:5173](http://localhost:5173)
*   **Backend**: [http://localhost:5000](http://localhost:5000)
*   **AI Service**: [http://localhost:5001](http://localhost:5001)

---

## 📂 Project Structure

```
Collaboration/
├── client/          # ⚡ React + Vite Frontend
│   ├── src/
│   └── index.css    # Global "Deep Space" Design System
├── server/          # 🛡️ Node.js + Express Backend
│   ├── models/      # MongoDB Schemas
│   └── routes/      # API Endpoints
├── ai-service/      # 🧠 Python AI Microservice
│   └── main.py      # Flask App
└── package.json     # 📦 Monorepo Orchestration
```

---

## 🤝 Contributing

We welcome contributions to make Void even better! Please fork the repo and submit a PR.

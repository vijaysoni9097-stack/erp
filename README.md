# ERP System - Purchase Orders UI

A modern, responsive Purchase Orders management interface built with React and Bootstrap 5. This is a frontend UI component of the ERP system designed to handle pharmaceutical purchase order management.

## 🎯 Features

- **Purchase Orders Dashboard** - View and manage all purchase orders
- **Status Tracking** - Track orders with multiple status types (Pending Approval, In Transit, Delivered)
- **Analytics Cards** - Quick metrics for pending approvals, transit orders, and spending
- **Data Table** - Comprehensive list of purchase orders with search and filtering.
- **Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices
- **Modern UI** - Built with Bootstrap 5 and custom styling

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

### Windows
- **Node.js** (v20.12.0 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **Git** (optional) - [Download here](https://git-scm.com/)

### Mac
- **Node.js** (v20.12.0 or higher) - [Download here](https://nodejs.org/) or use Homebrew:
  ```bash
  brew install node
  ```
- **npm** (comes with Node.js)
- **Git** (optional) - Pre-installed on most macOS systems, or use Homebrew:
  ```bash
  brew install git
  ```

To verify your installations:
```bash
node --version
npm --version
```

## 🚀 Quick Start

### Clone the Repository

**Windows:**
```bash
cd Desktop
git clone https://github.com/vijaysoni9097-stack/erp.git
cd erp
```

**Mac:**
```bash
cd ~/Desktop
git clone https://github.com/vijaysoni9097-stack/erp.git
cd erp
```

Or if you already have the project folder:
```bash
cd /path/to/erp
```

### Install Dependencies

Both Windows and Mac:
```bash
npm install
```

This will install all required packages including:
- React
- Vite (build tool)
- Bootstrap 5
- Font Awesome Icons

## 🎮 Running the Development Server

### Windows
```bash
npm run dev
```

### Mac
```bash
npm run dev
```

After running the command, you'll see output like:
```
VITE v7.3.6  ready in 301 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

**Open your browser and navigate to:** `http://localhost:5173/`

The page will automatically reload when you make changes to the code (Hot Module Replacement).

### Stop the Development Server

Press `Ctrl + C` (Windows) or `Cmd + C` (Mac) in the terminal.

## 📦 Building for Production

### Windows
```bash
npm run build
```

### Mac
```bash
npm run build
```

This will create an optimized production build in the `dist/` folder.

To preview the production build locally:
```bash
npm run preview
```

Then open `http://localhost:4173/` in your browser.

## 📁 Project Structure

```
erp/
├── src/
│   ├── components/          # Reusable components
│   ├── pages/
│   │   └── PurchaseOrders.jsx   # Main purchase orders page
│   ├── styles/
│   │   └── PurchaseOrders.css   # Page styling
│   ├── App.jsx              # Main app component
│   ├── App.css              # App styling
│   ├── main.jsx             # Entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
├── package.json             # Project dependencies
└── README.md                # This file
```

## 🛠 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on http://localhost:5173 |
| `npm run build` | Build optimized production bundle |
| `npm run preview` | Preview production build locally |
| `npm install` | Install project dependencies |

## 🎨 Tech Stack

- **React 18** - UI library
- **Vite 7** - Next-generation build tool
- **Bootstrap 5** - CSS framework
- **Font Awesome** - Icon library
- **Axios** - HTTP client (ready for API integration)

## 🔧 Troubleshooting

### Port 5173 already in use

**Windows:**
```bash
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

**Mac:**
```bash
lsof -ti:5173 | xargs kill -9
```

Then run `npm run dev` again.

### Module not found errors

Try reinstalling dependencies:

**Windows & Mac:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Node version issues

If you get Node version warnings, ensure you're using Node v20.12.0 or higher:

**Windows:**
```bash
node --version
```

**Mac:**
```bash
node --version
```

Update Node if needed:
- Windows: Download from [nodejs.org](https://nodejs.org/)
- Mac: `brew upgrade node`

### Vite/Build issues

Clear cache and rebuild:

**Windows & Mac:**
```bash
rm -rf dist
npm run build
```

## 📝 Development Tips

### Adding New Pages

1. Create a new file in `src/pages/`
2. Import it in `src/App.jsx`
3. Update routing as needed

### Adding New Components

1. Create a new file in `src/components/`
2. Export as default or named export
3. Import and use in pages

### Customizing Styles

- Global styles: Edit `src/index.css`
- Page-specific styles: Edit `src/pages/PurchaseOrders.css`
- Bootstrap variables can be customized in CSS

## 🚀 Deployment

### Deploy to GitHub Pages

```bash
npm run build
git add dist/
git commit -m "Build for production"
git push origin main
```

### Deploy to Netlify

1. Push code to GitHub
2. Connect repository to Netlify
3. Set build command: `npm run build`
4. Set publish directory: `dist`

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

## 🤝 Git Workflow

### First Time Push

**Windows:**
```bash
cd erp
git config --global user.email "your-email@example.com"
git config --global user.name "Your Name"
git remote set-url origin git@github.com:vijaysoni9097-stack/erp.git
git push -u origin main
```

**Mac:**
```bash
cd ~/Desktop/erp
git config --global user.email "your-email@example.com"
git config --global user.name "Your Name"
git remote set-url origin git@github.com:vijaysoni9097-stack/erp.git
git push -u origin main
```

**Note:** Make sure your SSH key is added to GitHub (see GitHub SSH setup docs)

### Regular Commits

```bash
git add .
git commit -m "Your commit message"
git push origin main
```

## 📖 Resources

- [React Documentation](https://react.dev/)
- [Vite Guide](https://vite.dev/)
- [Bootstrap 5 Documentation](https://getbootstrap.com/docs/5.0/)
- [Font Awesome Icons](https://fontawesome.com/icons)

## 🐛 Known Issues

- Node v20.12.0 may show version warnings with Vite 7 (runs fine)
- Older versions of npm may have optional dependency issues (fixed with `npm install`)

## 📄 License

This project is part of the ERP system. All rights reserved.

## ✉️ Support

For issues or questions:
1. Check the troubleshooting section
2. Review error messages carefully
3. Clear cache: `npm cache clean --force`
4. Reinstall: `npm install`

---

**Last Updated:** September 2026
**Version:** 1.0.0

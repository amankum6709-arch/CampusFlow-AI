import "./AppLayout.css";

// ============================================================
// Naam: App Layout
// Kya karta hai: Application ke page content ko ek common layout wrapper deta hai.
// ============================================================

function AppLayout({ children }) {
  return <div className="app-layout">{children}</div>;
}

export default AppLayout;

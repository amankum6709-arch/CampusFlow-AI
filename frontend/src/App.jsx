// ============================================================
// Naam: App
// Kya karta hai: Root application ko common layout aur routes ke saath connect karta hai.
// ============================================================

import AppLayout from "./layouts/AppLayout";
import AppRoutes from "./routes/AppRoutes";

function App() {
  return (
    <AppLayout>
      <AppRoutes />
    </AppLayout>
  );
}

export default App;

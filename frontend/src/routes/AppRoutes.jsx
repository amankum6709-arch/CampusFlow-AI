import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../services/api";
import Home from "../pages/Home";
import Auth from "../pages/Auth";
import UniversitySetup from "../pages/UniversitySetup";
import Dashboard from "../pages/Dashboard/Dashboard";
import TimetableWorkspace from "../pages/Timetable/TimetableWorkspace";

function ProtectedRoute({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/auth?mode=login" state={{ from: location }} replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
        <Route path="/setup" element={<ProtectedRoute><UniversitySetup /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/timetable" element={<ProtectedRoute><TimetableWorkspace /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;

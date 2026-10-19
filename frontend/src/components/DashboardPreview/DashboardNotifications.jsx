// ==========================================
// AI Suggestions
// ==========================================

import { FiAlertCircle, FiCheckCircle, FiUsers } from "react-icons/fi";

function DashboardNotifications() {
  return (
    <div className="dashboard-notifications">

      <h3>🤖 AI Suggestions</h3>

      <div className="notification-card">
        <FiAlertCircle className="notification-icon orange" />

        <div>
          <h4>Faculty Conflict</h4>
          <p>Prof. Sharma has overlapping classes at 11:00 AM.</p>
        </div>
      </div>

      <div className="notification-card">
        <FiUsers className="notification-icon blue" />

        <div>
          <h4>Room Optimization</h4>
          <p>Room B-203 is free. AI suggests moving AI Lab.</p>
        </div>
      </div>

      <div className="notification-card">
        <FiCheckCircle className="notification-icon green" />

        <div>
          <h4>Schedule Optimized</h4>
          <p>Timetable efficiency increased by 18%.</p>
        </div>
      </div>

    </div>
  );
}

export default DashboardNotifications;
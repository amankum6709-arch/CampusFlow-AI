import { PLANS, setPlan } from "../../utils/subscription";
import "./UpgradePrompt.css";

const FEATURE_DESCRIPTIONS = {
  manual_scheduling: "Drag & drop timetable editing",
  excel_import: "Import setup data from Excel files",
  ai_assistant: "AI-powered timetable analysis",
  ai_natural_language: "Ask questions about your timetable in plain English",
  ai_conflict_fix: "AI suggests fixes for scheduling conflicts",
  conflict_detection: "Automatic conflict detection",
  saved_context: "Save and restore context across sessions",
  unlimited_timetables: "Generate unlimited timetables",
  priority_support: "Priority customer support",
};

function UpgradePrompt({ feature, onDismiss }) {
  const handleUpgrade = () => {
    setPlan(PLANS.ADVANCED);
    window.location.reload();
  };

  const description = FEATURE_DESCRIPTIONS[feature] || "This feature";

  return (
    <div className="upgrade-overlay" onClick={onDismiss}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upgrade-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>

        <h2 className="upgrade-title">Unlock Advanced Plan</h2>
        <p className="upgrade-description">
          <strong>{description}</strong> is available on the Advanced plan.
        </p>

        <div className="upgrade-features">
          <p className="upgrade-features-heading">Advanced includes:</p>
          <ul>
            <li>AI timetable assistant</li>
            <li>Natural language queries</li>
            <li>AI conflict resolution</li>
            <li>Excel import & export</li>
            <li>Saved context across sessions</li>
            <li>Unlimited timetable generations</li>
          </ul>
        </div>

        <div className="upgrade-actions">
          <button type="button" className="upgrade-btn-primary" onClick={handleUpgrade}>
            Upgrade to Advanced
          </button>
          <button type="button" className="upgrade-btn-secondary" onClick={onDismiss}>
            Continue with Free
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpgradePrompt;

// =======================================
// Primary Button
// =======================================

import "./Button.css";

function PrimaryButton() {
  return (
    <button className="primary-btn" onClick={() => { window.location.href = "/auth?mode=signup"; }}>
      Get Started →
    </button>
  );
}

export default PrimaryButton;
// ============================================================
// Naam: Setup Step Header
// Kya karta hai: Har setup step ke icon, heading aur description ko common format mein dikhata hai.
// ============================================================

function SetupStepHeader({ icon, title, description }) {
  return (
    <div className="step-title">
      <div className="step-icon">{icon}</div>

      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default SetupStepHeader;

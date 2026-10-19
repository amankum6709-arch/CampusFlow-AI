// ======================================================
// Hero Left
// ======================================================

import "./Hero.css";

import PrimaryButton from "../Buttons/PrimaryButton";
import SecondaryButton from "../Buttons/SecondaryButton";

function HeroLeft() {
  return (
    <div className="hero-left">
      <h1 className="hero-title">
        Reimagining University
        <br />
        Scheduling with
        <br />
        <span className="gradient-text">Artificial Intelligence ✨</span>
      </h1>

      <div className="hero-description">
        CampusFlow AI automates timetable generation, faculty scheduling,
        classroom allocation and academic resource management using advanced
        artificial intelligence for modern universities.
      </div>

      <div className="hero-buttons">
        <PrimaryButton />
        <SecondaryButton />
      </div>

      <div className="trusted-text">
        Trusted by forward-thinking universities
        <div className="rating-text">
          <span>AI Scheduling Experience 4.9/5 ⭐⭐⭐⭐⭐</span>
        </div>
        <div className="hero-badge">✨ AI Powered University Management</div>
      </div>
    </div>
  );
}

export default HeroLeft;

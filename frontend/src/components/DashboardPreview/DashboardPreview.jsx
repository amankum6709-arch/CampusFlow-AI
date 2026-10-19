import "./DashboardPreview.css";

function DashboardPreview() {
  return (
    <div className="dashboard-preview">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-box">AI</div>
          <h3>CampusFlow</h3>
        </div>

        <ul>
          <li className="active">🏠 Dashboard</li>
          <li>📅 Timetable</li>
          <li>👨‍🏫 Faculty</li>
          <li>🎓 Students</li>
          <li>📚 Courses</li>
           <li>🏫 Rooms</li>
           <li>🗓AcademicCal..</li>
          <li>🤖 AI Scheduler</li>
          <li>📊 Analytics</li>
           <li>📄 Reports</li>
             <li>🔔 Notifications</li>
          <li>⚙ Settings</li>

        </ul>
      <div className="sidebar-profile">

    <img
        src="https://i.pravatar.cc/80"
        alt="Admin"
    />

    <div>

        <h4>AmanKumar</h4>

        <p>Administrator</p>
        
        <span className="online-status">
            <span className="online-dot"></span>
            Online
        </span>

    </div>

</div>
      </aside>

      {/* Main */}
      <div className="dashboard-content">

        {/* Header */}
        <div className="dashboard-top">
          <div>
            <h2>Dashboard Preview</h2>
            <p>Welcome back 👋</p>
          </div>

          <input
            type="text"
            placeholder="Search..."
          />
        </div>

        {/* Stats */}
        <div className="cards">

          <div className="card">
            <span>Students</span>
            <h3>12,540</h3>
          </div>

          <div className="card">
            <span>Faculty</span>
            <h3>486</h3>
          </div>

          <div className="card">
            <span>Rooms</span>
            <h3>182</h3>
          </div>

          <div className="card">
            <span>Accuracy</span>
            <h3>99%</h3>
          </div>

        </div>

        {/* Bottom */}
        <div className="bottom-grid">

          {/* Timetable */}

          <div className="timetable-section">

            <div className="section-header">
              <h3>Today's Timetable</h3>
              <span className="view-all">
                View Full →
              </span>
            </div>

            <div className="timetable-list">

              <div className="subject-card ai">

                <div className="subject-time">
                  <span>09:00 AM</span>
                  <span className="dash">−</span>
                  <span>10:00 AM</span>
                </div>

                <div className="subject-details">
                  <h4>Artificial Intelligence</h4>
                  <p>Prof. Rahul Sharma</p>
                  <small>Room 304</small>
                </div>

              </div>

              <div className="subject-card dbms">

                <div className="subject-time">
                  <span>10:15 AM</span>
                  <span className="dash">−</span>
                  <span>11:15 AM</span>
                </div>

                <div className="subject-details">
                  <h4>Database Management</h4>
                  <p>Prof. Neha Verma</p>
                  <small>Lab 2</small>
                </div>

              </div>

              <div className="subject-card os">

                <div className="subject-time">
                  <span>11:30 AM</span>
                  <span className="dash">−</span>
                  <span>12:30 PM</span>
                </div>

                <div className="subject-details">
                  <h4>Operating Systems</h4>
                  <p>Prof. Amit Kumar</p>
                  <small>Room 201</small>
                </div>

              </div>

              <div className="subject-card web">

                <div className="subject-time">
                  <span>01:30 PM</span>
                  <span className="dash">−</span>
                  <span>02:30 PM</span>
                </div>

                <div className="subject-details">
                  <h4>Web Development</h4>
                  <p>Prof. Sneha Gupta</p>
                  <small>Lab 5</small>
                </div>

              </div>

              <div className="subject-card cloud">

                <div className="subject-time">
                  <span>02:45 PM</span>
                  <span className="dash">−</span>
                  <span>03:45 PM</span>
                </div>

                <div className="subject-details">
                  <h4>Cloud Computing</h4>
                  <p>Prof. Arjun Singh</p>
                  <small>Room 402</small>
                </div>

              </div>

              <div className="subject-card ml">

                <div className="subject-time">
                  <span>04:00 PM</span>
                  <span className="dash">−</span>
                  <span>05:00 PM</span>
                </div>

                <div className="subject-details">
                  <h4>Machine Learning</h4>
                  <p>Prof. Priya Mehta</p>
                  <small>AI Lab</small>
                </div>

              </div>

            </div>

          </div>

          {/* AI Suggestions */}

          <div className="ai-section">

            <h3>🤖 AI Suggestions</h3>

            <div className="ai-card success">
              ✔ Move AI Lecture to Room 402
            </div>

            <div className="ai-card warning">
              ⚠ Faculty Clash Detected
            </div>

            <div className="ai-card info">
              📈 Utilization Improved by 18%
            </div>

            <div className="ai-card success">
              ✅ Timetable Optimized
              
            </div>

{/* Quick Actions */}


<div className="quick-actions">

    <h3>Quick Actions</h3>

    <div className="quick-grid">

        <div className="quick-item">
            <div className="quick-icon blue">📚</div>
            <span>Add Class</span>
        </div>

        <div className="quick-item">
            <div className="quick-icon purple">👨‍🏫</div>
            <span>Add Faculty</span>
        </div>

        <div className="quick-item">
            <div className="quick-icon green">🏫</div>
            <span>Add Room</span>
        </div>

        <div className="quick-item">
            <div className="quick-icon orange">🤖</div>
            <span>Generate Schedule</span>
        </div>

    </div>

</div>
{/* Attendance Overview */}
<div className="attendance-card">

  <div className="attendance-header">
    <h3>Attendance Overview</h3>

    <button className="attendance-filter">
      This Week <span>⌄</span>
    </button>
  </div>

  <div className="attendance-chart">

    <div className="attendance-y-axis">
      <span>100%</span>
      <span>75%</span>
      <span>50%</span>
      <span>25%</span>
      <span>0%</span>
    </div>

    <div className="chart-area">

      <svg
        viewBox="0 0 500 190"
        className="attendance-svg"
      >

        <line x1="0" y1="15" x2="500" y2="15" />
        <line x1="0" y1="55" x2="500" y2="55" />
        <line x1="0" y1="95" x2="500" y2="95" />
        <line x1="0" y1="135" x2="500" y2="135" />
        <line x1="0" y1="175" x2="500" y2="175" />

        <path
          className="attendance-fill"
          d="M20 75
             C55 82 70 92 105 88
             C140 84 145 35 180 48
             C215 62 230 38 260 35
             C295 32 300 62 335 70
             C370 78 390 88 415 75
             C440 62 445 28 480 32
             L480 175
             L20 175 Z"
        />

        <path
          className="attendance-line"
          d="M20 75
             C55 82 70 92 105 88
             C140 84 145 35 180 48
             C215 62 230 38 260 35
             C295 32 300 62 335 70
             C370 78 390 88 415 75
             C440 62 445 28 480 32"
        />

        <circle cx="20" cy="75" r="4" />
        <circle cx="105" cy="88" r="4" />
        <circle cx="180" cy="48" r="4" />
        <circle cx="260" cy="35" r="4" />
        <circle cx="335" cy="70" r="4" />
        <circle cx="415" cy="75" r="4" />
        <circle cx="480" cy="32" r="4" />

        <rect
          className="attendance-badge"
          x="238"
          y="3"
          width="45"
          height="24"
          rx="7"
        />

        <text
          className="attendance-badge-text"
          x="260"
          y="19"
          textAnchor="middle"
        >
          85%
        </text>

      </svg>

      <div className="attendance-days">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>

    </div>
  </div>

</div>
          </div>

        </div>

      </div>

    </div>
  );
}


export default DashboardPreview;




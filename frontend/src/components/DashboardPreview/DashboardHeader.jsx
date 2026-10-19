// =========================================
// Dashboard Header
// =========================================

import { FiBell, FiSearch } from "react-icons/fi";

function DashboardHeader() {

    return (

        <header className="dashboard-header">

            <div>

                <h2>

                    Welcome Back, Aman 👋

                </h2>

                <p>

                    Here's what's happening on your campus today.

                </p>

            </div>

            <div className="header-right">

                <div className="search-box">

                    <FiSearch />

                    <input
                        type="text"
                        placeholder="Search anything..."
                    />

                </div>

                <button className="notification-btn">

                    <FiBell />

                </button>

                <img
                    src="https://i.pravatar.cc/150?img=12"
                    alt="profile"
                />

            </div>

        </header>

    );

}

export default DashboardHeader;
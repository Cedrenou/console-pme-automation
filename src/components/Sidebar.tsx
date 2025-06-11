import React from "react";
import Link from "next/link";
import { FaTachometerAlt, FaFileAlt, FaEnvelope, FaChartBar, FaCog, FaUserCircle } from "react-icons/fa";

const links = [
  { href: "/", label: "Dashboard", icon: <FaTachometerAlt /> },
  { href: "/factures", label: "Factures", icon: <FaFileAlt /> },
  { href: "/emails", label: "Emails", icon: <FaEnvelope /> },
  { href: "/reporting", label: "Reporting", icon: <FaChartBar /> },
  { href: "/parametres", label: "Paramètres", icon: <FaCog /> },
];

const Sidebar = () => (
  <nav className="w-64 bg-[#181C2A] text-white h-screen flex flex-col justify-between shadow-lg">
    <div>
      <div className="flex items-center gap-2 text-2xl font-bold px-6 py-8">
        <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
        Sunset Lambda
      </div>
      <div className="px-6 mb-6">
        <input
          type="text"
          placeholder="Search for..."
          className="w-full px-3 py-2 rounded bg-[#23263A] text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <ul className="flex flex-col gap-1 px-2">
        {links.map(link => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-blue-600/80 transition-colors text-gray-200 font-medium focus:bg-blue-700 focus:outline-none"
            >
              <span className="text-lg">{link.icon}</span>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
    <div className="px-6 pb-8 flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-4">
        <FaUserCircle className="text-3xl text-blue-400" />
        <div>
          <div className="font-semibold">John Carter</div>
          <div className="text-xs text-gray-400">Account settings</div>
        </div>
      </div>
    </div>
  </nav>
);

export default Sidebar; 
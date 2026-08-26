import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/useAuthStore";
import { useTheme } from "../../context/ThemeContext";
import Tooltip from "../ui/Tooltip";
import { cn } from "../../utils/cn";
import { SIDEBAR_EXPANDED_W, SIDEBAR_COLLAPSED_W } from "../../utils/constants";
import {
  Menu,
  ChevronLeft,
  LayoutDashboard,
  Trophy,
  ChartCandlestick,
  Briefcase,
  Bot,
  Shield,
  Globe,
  ClipboardList,
  Landmark,
  Gem,
  FlipHorizontal2,
  Lightbulb,
  GraduationCap,
  ClipboardCheck,
  ListCheck,
} from "lucide-react";

/* ─── Role-Based Section definitions (Academic Campus Priority) ─── */
function getNavigationSections(role) {
  // 1. Priority 1: Academic Campus Suite
  let academicSection = {
    label: "Academic Campus",
    items: [
      { to: "/academy", icon: GraduationCap, label: "Academy" },
      { to: "/student/assignments", icon: ListCheck, label: "Trading Tasks" },
      { to: "/leaderboard", icon: Trophy, label: "Campus Ranking" },
      { to: "/mentor", icon: Lightbulb, label: "AI Mentor" },
    ],
  };

  if (role === "faculty") {
    academicSection = {
      label: "Faculty Academic",
      items: [
        { to: "/faculty/portal", icon: GraduationCap, label: "Course Builder" },
        { to: "/faculty/assignments", icon: ListCheck, label: "Trading Tasks" },
        { to: "/leaderboard", icon: Trophy, label: "Campus Ranking" },
        { to: "/mentor", icon: Lightbulb, label: "AI Mentor" },
      ],
    };
  } else if (role === "institution_admin") {
    academicSection = {
      label: "Institution Suite",
      items: [
        { to: "/institution/portal", icon: GraduationCap, label: "Campus Portal" },
        { to: "/institution/courses", icon: ClipboardCheck, label: "Course Approvals" },
        { to: "/leaderboard", icon: Trophy, label: "Campus Ranking" },
        { to: "/mentor", icon: Lightbulb, label: "AI Mentor" },
      ],
    };
  } else if (role === "admin") {
    academicSection = {
      label: "Super Admin",
      items: [
        { to: "/admin/panel", icon: Shield, label: "Admin Panel" },
        { to: "/admin/academic", icon: GraduationCap, label: "Institutions" },
        { to: "/leaderboard", icon: Trophy, label: "Campus Ranking" },
        { to: "/mentor", icon: Lightbulb, label: "AI Mentor" },
      ],
    };
  }

  // 2. Priority 2: Trading Lab
  const tradingLabSection = {
    label: "Trading Lab",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/terminal", icon: ChartCandlestick, label: "Terminal" },
      { to: "/market", icon: Globe, label: "Market" },
      { to: "/orders", icon: ClipboardList, label: "Orders" },
      { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
    ],
  };

  // 3. Priority 3: Derivatives & Algo Lab
  const derivativesSection = {
    label: "Derivatives & Algo",
    items: [
      { to: "/futures", icon: Landmark, label: "Futures" },
      { to: "/options", icon: FlipHorizontal2, label: "Options" },
      { to: "/algo", icon: Bot, label: "Algo Trading" },
      { to: "/auto-alpha", icon: Shield, label: "Alpha Auto" },
    ],
  };

  return [academicSection, tradingLabSection, derivativesSection];
}

/* ─── Reusable nav item ──────────────────────────────────── */
function SidebarItem({ to, icon: Icon, label, collapsed, onNavigate }) {
  const link = (
    <NavLink
      to={to}
      aria-label={label}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "relative flex items-center h-8 rounded-md transition-colors duration-150 ease-out",
          "text-[12px] font-medium",
          collapsed
            ? "justify-center w-10 mx-auto"
            : "gap-2.5 px-3",
          isActive
            ? collapsed
              ? "bg-primary-500/10 text-primary-600 ring-1 ring-primary-500/20"
              : "bg-primary-500/[0.08] text-primary-600 border-l-[2px] border-primary-500 font-semibold"
            : collapsed
              ? "text-gray-500 hover:text-heading hover:bg-overlay/[0.05]"
              : "text-gray-500 hover:text-heading hover:bg-overlay/[0.04] border-l-[2px] border-transparent",
        )
      }
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span
        className={cn(
          "whitespace-nowrap overflow-hidden transition-all duration-200 ease-in-out",
          collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[136px]"
        )}
      >
        {label}
      </span>
    </NavLink>
  );

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Tooltip content={label} position="right" delay={200}>
          {link}
        </Tooltip>
      </div>
    );
  }
  return link;
}

/* ─── Section label ──────────────────────────────────────── */
function SectionLabel({ label, collapsed }) {
  return (
    <p className={cn(
      "px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 select-none transition-all duration-200 ease-in-out overflow-hidden whitespace-nowrap",
      collapsed ? "opacity-0 max-h-0 py-0" : "opacity-100 max-h-8"
    )}>
      {label}
    </p>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user); // reactive — updates instantly on photo change
  const { theme } = useTheme();
  const navigate = useNavigate();
  const collapsedLogoSrc = theme === "dark" ? "/white-logo.png" : "/dark-logo.png";
  const sections = getNavigationSections(user?.role);

  const closeMobileDrawer = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024 && !collapsed) {
      onToggle?.();
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-[2px]"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      <aside
        style={{ width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
        className={cn(
          "fixed left-0 top-0 h-screen z-40 flex flex-col",
          "bg-[var(--bg-base)] border-r border-edge/10",
          "transition-[width] duration-[250ms] ease-in-out overflow-hidden",
          collapsed
            ? "max-lg:-translate-x-full"
            : "max-lg:translate-x-0 max-lg:w-[240px]",
        )}
      >
        {/* ── Brand row ── */}
        <div
          className={cn(
            "relative flex-shrink-0 transition-all duration-300",
            collapsed
              ? "h-[80px] px-1.5 pt-2 pb-2 flex flex-col items-center gap-1"
              : "h-[72px] px-4 py-1.5",
          )}
        >
          {collapsed ? (
            <>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="p-2 rounded-lg text-gray-400 hover:text-heading hover:bg-overlay/5 transition-all duration-300"
              >
                <Menu className="w-4.5 h-4.5" />
              </button>

              <a
                href="https://www.alphasync.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full flex-1 min-h-0"
                title="AlphaSync"
              >
                <img
                  src={collapsedLogoSrc}
                  alt="AlphaSync"
                  draggable={false}
                  className="h-12 w-12 max-w-[52px] max-h-[52px] object-contain flex-shrink-0"
                />
              </a>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="absolute right-2 top-2 p-2 rounded-lg text-gray-400 hover:text-heading hover:bg-overlay/5 transition-all duration-300"
              >
                <ChevronLeft className="w-4.5 h-4.5" />
              </button>

              <div className="flex items-center w-full h-full justify-start pr-10">
                <a
                  href="https://www.alphasync.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block min-w-0 flex-1"
                >
                  <img
                    src="/logo.svg"
                    alt="AlphaSync"
                    className="h-12 max-w-[170px] object-contain object-left transition-all duration-300 logo-light-adapt"
                  />
                </a>
              </div>
            </>
          )}
          {/* Tagline — only visible when collapsed (expanded version is inline with logo) */}
        </div>

        {/* ── Divider ── */}
        <div className="mx-3 h-px bg-edge/8" />

        {/* ── Navigation ── */}
        <nav className={cn("flex-1 px-2 overflow-y-auto overflow-x-hidden space-y-3", collapsed && "pt-1.5 space-y-2")}>
          {collapsed ? (
            <div className="space-y-1">
              {sections.flatMap((section) => section.items).map((item) => (
                <SidebarItem key={item.to} {...item} collapsed={collapsed} onNavigate={closeMobileDrawer} />
              ))}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.label}>
                <SectionLabel label={section.label} collapsed={collapsed} />
                <div className="space-y-0.5 mt-0.5">
                  {section.items.map((item) => (
                    <SidebarItem key={item.to} {...item} collapsed={collapsed} onNavigate={closeMobileDrawer} />
                  ))}
                </div>
              </div>
            ))
          )}
        </nav>
      </aside>

    </>
  );
}

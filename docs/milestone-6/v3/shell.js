/* ─── ICONS ─── */
const IC = {
  grid: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  alert: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  activity: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  clock: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  globe: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  branch: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  server: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`,
  settings: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>`,
  layers: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  logout: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  moon: `<svg id="ico-moon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun: `<svg id="ico-sun"  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
}

/* ─── NAV CONFIG ─── */
const NAV = [
  { group: "Monitor" },
  { id: "overview", href: "overview.html", icon: "grid", label: "Overview" },
  {
    id: "issues",
    href: "issues.html",
    icon: "alert",
    label: "Issues",
    count: 12,
  },
  { id: "vitals", href: "vitals.html", icon: "activity", label: "Web Vitals" },
  {
    id: "performance",
    href: "performance.html",
    icon: "clock",
    label: "Performance",
  },
  { id: "network", href: "network.html", icon: "globe", label: "Network" },
  {
    id: "route-health",
    href: "route-health.html",
    icon: "branch",
    label: "Route Health",
  },
  { sep: true },
  { group: "System" },
  {
    id: "system",
    href: "system-health.html",
    icon: "server",
    label: "System Health",
  },
  {
    id: "settings",
    href: "settings.html",
    icon: "settings",
    label: "Settings",
  },
]

/* ─── SHELL ─── */
const Shell = {
  init(activeId) {
    const mode = localStorage.getItem("watch-mode") || "dark"
    document.documentElement.classList.add(mode)
    Shell.updateToggle(mode)
    const el = document.getElementById("sidebar")
    if (el) el.innerHTML = Shell.renderSidebar(activeId)
  },

  renderSidebar(activeId) {
    let navHtml = ""
    for (const item of NAV) {
      if (item.group) {
        navHtml += `<div class="nav-group-label">${item.group}</div>`
      } else if (item.sep) {
        navHtml += `<div class="nav-sep"></div>`
      } else {
        navHtml += `
          <a class="nav-item${activeId === item.id ? " active" : ""}" href="${item.href}">
            <span class="nav-dot"></span>
            ${IC[item.icon]}
            ${item.label}
            ${item.count ? `<span class="nav-count">${item.count}</span>` : ""}
          </a>`
      }
    }

    return `
      <div class="sidebar-top">
        <div class="brand">
          <div class="brand-mark">W</div>
          <span class="brand-name">Watch</span>
        </div>
        <button class="search-trigger">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          Search&hellip;
          <span class="search-key">&#8984;K</span>
        </button>
      </div>
      <nav class="sidebar-nav">
        ${navHtml}
        <div class="nav-sep"></div>
        <a class="nav-item nav-meta${activeId === "design-system" ? " active" : ""}" href="design-system.html">
          <span class="nav-dot"></span>${IC.layers}Design System
        </a>
      </nav>
      <div class="ctx-block">
        <div class="ctx-label">Project</div>
        <div class="ctx-row">
          <div class="ctx-pip" style="background:var(--success)"></div>
          <span class="ctx-name">Customer Portal</span>
          <span class="ctx-chevron">&#9662;</span>
        </div>
        <div class="ctx-label">Environment</div>
        <div class="ctx-row">
          <div class="ctx-pip" style="background:var(--warning)"></div>
          <span class="ctx-name">staging</span>
          <span class="ctx-chevron">&#9662;</span>
        </div>
      </div>
      <div class="sidebar-foot">
        <div class="account-row">
          <div class="av">AT</div>
          <span class="account-name">Agiri Taofeek</span>
          ${IC.logout}
        </div>
      </div>`
  },

  updateToggle(mode) {
    const lbl = document.getElementById("mode-label")
    const moon = document.getElementById("ico-moon")
    const sun = document.getElementById("ico-sun")
    if (lbl) lbl.textContent = mode === "dark" ? "Light mode" : "Dark mode"
    if (moon) moon.style.display = mode === "dark" ? "inline" : "none"
    if (sun) sun.style.display = mode === "light" ? "inline" : "none"
  },
}

/* ─── THEME TOGGLE ─── */
function toggleMode() {
  const h = document.documentElement
  const next = h.classList.contains("dark") ? "light" : "dark"
  h.classList.remove("dark", "light")
  h.classList.add(next)
  localStorage.setItem("watch-mode", next)
  Shell.updateToggle(next)
}

/* ─── TOASTS ─── */
const TOAST_DATA = {
  success: {
    title: "Change saved",
    msg: "Your change was applied successfully.",
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  },
  error: {
    title: "Request failed",
    msg: "Could not complete the action. Retry.",
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  },
  warning: {
    title: "Key expires soon",
    msg: "Rotate your key before Thursday.",
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },
  info: {
    title: "DSN copied",
    msg: "Paste into your @watch/browser init.",
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  },
}

function fireToast(type) {
  const d = TOAST_DATA[type] || TOAST_DATA.info
  const el = document.createElement("div")
  el.className = `toast t-${type}`
  el.innerHTML = `<span class="toast-icon">${d.icon}</span><div class="toast-bd"><div class="toast-title">${d.title}</div><div class="toast-msg">${d.msg}</div></div><button class="toast-x" onclick="this.closest('.toast').remove()">&#x2715;</button>`
  document.getElementById("toast-stack").appendChild(el)
  setTimeout(() => el.remove(), 4000)
}

/* ─── COPY ─── */
function copyText(btn, text) {
  navigator.clipboard.writeText(text).catch(() => {})
  const orig = btn.textContent
  btn.textContent = "Copied!"
  setTimeout(() => {
    btn.textContent = orig
  }, 1500)
}

/* ─── TOPBAR TOGGLE SNIPPET (reused in every page) ─── */
const TOGGLE_BTN = `
  <button class="toggle-pill" onclick="toggleMode()">
    <svg id="ico-moon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <svg id="ico-sun"  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <span id="mode-label">Light mode</span>
  </button>`

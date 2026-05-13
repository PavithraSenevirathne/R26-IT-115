import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = 'http://172.20.10.2:5001';

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #eee8df;
    --surface:   #f5f0e8;
    --surface2:  #ede7dc;
    --border:    #ddd6c8;
    --border2:   #cec5b3;
    --text:      #1c2419;
    --text2:     #4a5c43;
    --muted:     #8a9982;
    --accent:    #2d4a2a;
    --accent2:   #3d6438;
    --accent-lt: #c8dbb8;
    --danger:    #b04a2a;
    --warn:      #b07a2a;
    --radius:    18px;
    --ease:      cubic-bezier(0.4,0,0.2,1);
    --shadow:    0 2px 12px rgba(0,0,0,0.07);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.11);
  }

  html { scroll-behavior: smooth; }
  body {
    font-family: 'Sora', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  @keyframes fadeUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
  @keyframes spin     { to{transform:rotate(360deg)} }
  @keyframes barGrow  { from{width:0%} }
  @keyframes shimmer  { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
  @keyframes pulse    { 0%,100%{opacity:.6} 50%{opacity:1} }
  @keyframes recPulse { 0%{box-shadow:0 0 0 0 rgba(176,74,42,.45)} 70%{box-shadow:0 0 0 10px rgba(176,74,42,0)} 100%{box-shadow:0 0 0 0 rgba(176,74,42,0)} }

  /* ── Layout ── */
  .ch { max-width: 480px; margin: 0 auto; min-height: 100vh; background: var(--bg); }

  /* ── Top bar ── */
  .ch-bar {
    position: sticky; top: 0; z-index: 100;
    height: 60px; padding: 0 20px;
    display: flex; align-items: center; gap: 12px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .ch-bar-back {
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--surface); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--text); flex-shrink: 0;
    box-shadow: var(--shadow);
  }
  .ch-bar-title { font-size: 1rem; font-weight: 700; color: var(--text); flex: 1; }
  .ch-bar-sub { font-size: .68rem; color: var(--muted); margin-top: 1px; }

  /* ── Clear button ── */
  .ch-clear-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 16px; border-radius: 20px;
    border: 1.5px solid #e8c8bc;
    background: linear-gradient(135deg, #fff5f2 0%, #fdeee9 100%);
    font-family: 'Sora', sans-serif; font-size: .75rem; font-weight: 700;
    color: var(--danger); cursor: pointer; flex-shrink: 0;
    transition: all .2s var(--ease);
    box-shadow: 0 2px 8px rgba(176,74,42,.12), inset 0 1px 0 rgba(255,255,255,.8);
    letter-spacing: .01em;
  }
  .ch-clear-btn:hover {
    background: linear-gradient(135deg, #fdeee9 0%, #faddcf 100%);
    border-color: var(--danger);
    box-shadow: 0 4px 14px rgba(176,74,42,.22), inset 0 1px 0 rgba(255,255,255,.6);
    transform: translateY(-1px);
  }
  .ch-clear-btn:active {
    transform: scale(0.96) translateY(0);
    box-shadow: 0 1px 4px rgba(176,74,42,.15);
  }

  /* ── Subtitle ── */
  .ch-subtitle {
    padding: 16px 20px 0;
    font-size: .8rem; color: var(--text2); line-height: 1.6;
    animation: fadeUp .4s var(--ease) both;
  }

  /* ── Body ── */
  .ch-body { padding: 16px 16px 100px; display: flex; flex-direction: column; gap: 14px; }

  /* ── Card ── */
  .ch-card {
    background: var(--surface); border-radius: var(--radius);
    border: 1px solid var(--border); overflow: hidden;
    box-shadow: var(--shadow); animation: fadeUp .4s var(--ease) both;
  }
  .ch-card-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px 12px;
  }
  .ch-card-title { font-size: .95rem; font-weight: 700; color: var(--text); }
  .ch-card-badge {
    font-size: .6rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
    padding: 4px 10px; border-radius: 20px;
  }
  .ch-card-badge.green  { background: #d4ebc2; color: #2d5a1e; border: 1px solid #b8d8a0; }
  .ch-card-badge.blue   { background: #c8dff5; color: #1a3f6a; border: 1px solid #a0c4ee; }
  .ch-card-body { padding: 0 18px 18px; }

  /* ── Field row ── */
  .ch-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .ch-field-row.single { grid-template-columns: 1fr; }
  .ch-field-label {
    font-size: .72rem; font-weight: 600; color: var(--text2);
    margin-bottom: 6px; display: block;
  }
  .ch-field-input-wrap { position: relative; }
  .ch-field-input {
    width: 100%; height: 48px; padding: 0 38px 0 14px;
    background: var(--surface2); border: 1.5px solid var(--border);
    border-radius: 12px; font-family: 'Sora', sans-serif;
    font-size: .92rem; font-weight: 500; color: var(--text);
    outline: none; transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
    -webkit-appearance: none;
  }
  .ch-field-input::placeholder { color: var(--muted); font-weight: 400; }
  .ch-field-input:focus {
    border-color: var(--accent2);
    box-shadow: 0 0 0 3px rgba(61,100,56,.12);
  }
  .ch-field-unit {
    position: absolute; right: 13px; top: 50%; transform: translateY(-50%);
    font-size: .72rem; font-weight: 600; color: var(--muted);
  }

  /* ── Toggle group ── */
  .ch-toggle-group { display: flex; gap: 8px; flex-wrap: wrap; }
  .ch-toggle {
    flex: 1; min-width: 80px; height: 42px; border-radius: 11px;
    border: 1.5px solid var(--border); background: var(--surface2);
    font-family: 'Sora', sans-serif; font-size: .77rem; font-weight: 600;
    color: var(--text2); cursor: pointer;
    transition: all .18s var(--ease);
    display: flex; align-items: center; justify-content: center;
  }
  .ch-toggle:hover { border-color: var(--accent2); color: var(--accent); }
  .ch-toggle.active {
    background: var(--accent); color: #fff; border-color: var(--accent);
    box-shadow: 0 3px 10px rgba(45,74,42,.3);
  }

  /* ── Divider ── */
  .ch-divider { height: 1px; background: var(--border); margin: 4px 0 14px; }

  /* ── Camera slots ── */
  .ch-cam-label {
    font-size: .78rem; font-weight: 600; color: var(--text2);
    margin-bottom: 10px; display: flex; align-items: center; gap: 6px;
  }
  .ch-cam-count { font-size: .68rem; color: var(--muted); font-weight: 500; }
  .ch-cam-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
  .ch-cam-slot {
    aspect-ratio: 1; border-radius: 14px;
    border: 2px dashed var(--border2); background: var(--surface2);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px; cursor: pointer; transition: all .2s var(--ease);
    position: relative; overflow: hidden;
  }
  .ch-cam-slot:hover { border-color: var(--accent2); background: var(--accent-lt); }
  .ch-cam-slot.filled { border-style: solid; border-color: var(--accent2); }
  .ch-cam-slot-icon { color: var(--muted); }
  .ch-cam-slot-label { font-size: .67rem; font-weight: 600; color: var(--muted); }
  .ch-cam-slot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
  .ch-cam-slot-remove {
    position: absolute; top: 4px; right: 4px; width: 20px; height: 20px;
    border-radius: 50%; background: rgba(0,0,0,.5); color: #fff;
    border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 11px; line-height: 1;
  }
  .ch-cam-input { display: none; }

  /* ── Text input area ── */
  .ch-ta-wrap { position: relative; }
  .ch-ta {
    width: 100%; min-height: 90px; background: var(--surface2);
    color: var(--text); border: 1.5px solid var(--border);
    border-radius: 12px; padding: 12px 44px 12px 14px;
    font-family: 'Sora', sans-serif; font-size: .84rem;
    line-height: 1.65; resize: none; outline: none;
    transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
  }
  .ch-ta::placeholder { color: var(--muted); font-size: .78rem; }
  .ch-ta:focus { border-color: var(--accent2); box-shadow: 0 0 0 3px rgba(61,100,56,.1); }

  /* ── Mic btn ── */
  .ch-mic {
    position: absolute; right: 9px; bottom: 9px;
    width: 32px; height: 32px; border-radius: 50%; border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all .2s var(--ease);
  }
  .ch-mic.idle { background: var(--surface); border: 1px solid var(--border); color: var(--muted); }
  .ch-mic.idle:hover { border-color: var(--accent2); color: var(--accent); }
  .ch-mic.rec  { background: var(--danger); color: #fff; animation: recPulse 1.4s infinite; }

  /* ── Bottom CTA ── */
  .ch-cta-bar {
    position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 100%; max-width: 480px; padding: 12px 16px 24px;
    background: linear-gradient(to top, var(--bg) 70%, transparent);
    z-index: 50;
  }
  .ch-cta {
    width: 100%; height: 56px; border: none; border-radius: 16px;
    font-family: 'Sora', sans-serif; font-size: .9rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center; gap: 9px;
    cursor: pointer; transition: all .22s var(--ease); position: relative; overflow: hidden;
  }
  .ch-cta.locked  { background: #c5bfb3; color: #8a857c; cursor: not-allowed; }
  .ch-cta.unlocked {
    background: var(--accent); color: #fff;
    box-shadow: 0 4px 20px rgba(45,74,42,.35);
  }
  .ch-cta.unlocked:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(45,74,42,.45); }
  .ch-cta.loading { background: var(--accent2); color: #fff; }
  .ch-cta-shimmer {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent);
    background-size: 600px 100%; animation: shimmer 1.6s infinite;
  }

  /* ── Loading / Error ── */
  .ch-loading {
    display: flex; align-items: center; gap: 10px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 12px 15px; font-size: .8rem; color: var(--text2);
    animation: fadeIn .25s ease;
  }
  .ch-spin {
    width: 15px; height: 15px; border-radius: 50%;
    border: 2px solid var(--border2); border-top-color: var(--accent);
    animation: spin .7s linear infinite; flex-shrink: 0;
  }
  .ch-err {
    background: #fff0ec; border: 1px solid #f4cfc2; border-radius: 14px;
    padding: 14px 15px; animation: fadeUp .3s ease;
  }
  .ch-err-head { display: flex; align-items: center; gap: 7px; font-size: .8rem; font-weight: 700; color: var(--danger); margin-bottom: 5px; }
  .ch-err-body { font-size: .76rem; color: #7a3a2a; line-height: 1.55; }

  /* ── Results ── */

  /* Verdict banner */
  .ch-verdict {
    border-radius: var(--radius); padding: 18px;
    border: 1px solid transparent; animation: fadeUp .4s ease;
    display: flex; flex-direction: column; gap: 12px;
  }
  .ch-verdict-top {
    display: flex; align-items: flex-start; gap: 13px;
  }
  .ch-verdict-ico {
    width: 46px; height: 46px; border-radius: 12px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 22px;
  }
  .ch-verdict-text { flex: 1; min-width: 0; }
  .ch-verdict-label { font-size: 1.1rem; font-weight: 700; margin-bottom: 4px; }
  .ch-verdict-tagline { font-size: .76rem; line-height: 1.55; opacity: .85; }

  .ch-chips {
    display: flex; gap: 7px; flex-wrap: wrap;
    padding-top: 2px;
  }
  .ch-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 11px; border-radius: 20px;
    font-size: .7rem; font-weight: 600; border: 1px solid transparent;
    white-space: nowrap;
  }
  .ch-chip-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  /* Action box */
  .ch-action-box {
    border-radius: 14px; padding: 14px 16px;
    border: 1.5px solid transparent; animation: fadeUp .45s ease;
  }
  .ch-action-box-head {
    display: flex; align-items: center; gap: 8px;
    font-size: .82rem; font-weight: 700; margin-bottom: 8px;
  }
  .ch-action-box-body { font-size: .78rem; line-height: 1.65; }

  /* Confidence bars */
  .ch-conf-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .ch-conf-row:last-child { margin-bottom: 0; }
  .ch-conf-name { width: 100px; font-size: .73rem; color: var(--text2); font-weight: 600; flex-shrink: 0; }
  .ch-conf-track { flex: 1; height: 6px; background: var(--surface2); border-radius: 6px; overflow: hidden; }
  .ch-conf-fill  { height: 100%; border-radius: 6px; animation: barGrow .9s cubic-bezier(.34,1.56,.64,1) both; }
  .ch-conf-pct   { width: 36px; text-align: right; font-size: .73rem; font-weight: 700; font-variant-numeric: tabular-nums; }

  /* Analysis details */
  .ch-reasons { display: flex; flex-direction: column; gap: 7px; }
  .ch-reason {
    display: flex; gap: 10px; align-items: flex-start;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 11px; padding: 10px 12px;
    animation: fadeUp .35s ease both;
  }
  .ch-reason-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
  .ch-reason-txt  { font-size: .79rem; line-height: 1.62; color: var(--text2); }

  /* Next steps */
  .ch-guide-step {
    display: flex; gap: 10px; align-items: flex-start;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 9px; padding: 10px 12px;
    font-size: .79rem; line-height: 1.58; color: var(--text2);
    animation: fadeUp .3s ease both;
  }
  .ch-guide-num {
    width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: .63rem; font-weight: 700; flex-shrink: 0; margin-top: 1px;
    background: var(--accent-lt); color: var(--accent);
  }

  /* Recheck pill */
  .ch-recheck {
    display: flex; align-items: center; gap: 8px;
    border-radius: 10px; padding: 9px 13px;
    font-size: .75rem; font-weight: 600; border: 1px solid transparent;
    animation: fadeUp .5s ease both;
  }

  /* Low-confidence warning */
  .ch-low-conf {
    background: #fdf3dc; border: 1px solid #e8d090; border-radius: 12px;
    padding: 11px 13px; display: flex; gap: 9px; align-items: flex-start;
    font-size: .75rem; color: #7a5a10; line-height: 1.55;
    animation: fadeUp .5s ease both;
  }
  .ch-low-conf-icon { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }

  .ch-section-lbl {
    display: flex; align-items: center; gap: 9px;
    font-size: .62rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
    color: var(--muted); animation: fadeUp .3s ease both;
  }
  .ch-section-lbl::before, .ch-section-lbl::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .ch-footer {
    text-align: center; font-size: .65rem; color: var(--muted);
    line-height: 1.65; padding-bottom: 10px; animation: fadeUp .5s ease both;
  }

  /* ── Completeness ── */
  .ch-progress-track { height: 5px; background: var(--surface2); border-radius: 5px; overflow: hidden; margin: 10px 0 6px; }
  .ch-progress-fill  { height: 100%; border-radius: 5px; animation: barGrow .8s cubic-bezier(.34,1.56,.64,1) both; }

  @media (max-width: 360px) {
    .ch-cam-slots { gap: 6px; }
    .ch-toggle-group { gap: 5px; }
  }
`;

// ─── Icon system ──────────────────────────────────────────────────────────────
function Icon({ name, size = 18 }) {
  const s = { width: size, height: size, display: 'inline-block', flexShrink: 0 };
  const icons = {
    back:    <><path d="M15 18l-6-6 6-6"/></>,
    camera:  <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></>,
    lock:    <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    leaf:    <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></>,
    mic:     <><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3M9 22h6"/></>,
    search:  <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
    check:   <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></>,
    clock:   <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    x:       <><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></>,
    info:    <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
    warn:    <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/></>,
    chart:   <><path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/></>,
    scissor: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/></>,
    sprout:  <><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2 2 3.5c-3.1.5-5.1-1.1-6.5-3.5c1.5-.4 3-.5 4.5 0z"/><path d="M14.1 6c-.1 2-.5 3.5-2.1 4.5c-.8-2.5-.4-4.5 2.1-4.5z"/></>,
    ruler:   <><path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></>,
    refresh: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></>,
    stop:    null,
  };
  if (name === 'stop') return (
    <svg style={s} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>
  );
  return (
    <svg style={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || icons.info}
    </svg>
  );
}

function useCSS() {
  useEffect(() => {
    const id = 'ch-css2';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id; el.textContent = CSS;
      document.head.appendChild(el);
    }
  }, []);
}

// ─── Verdict config ───────────────────────────────────────────────────────────
const VERDICT = {
  'Ready': {
    label: '✅ Ready to Harvest!',
    tagline: 'This shoot meets harvest criteria. Coppice at 6 cm from ground at a 45° angle.',
    icon: 'check',
    accent: '#2d6a30',
    bg: '#e8f5e0',
    border: '#b8d8a0',
    iconBg: '#c8eab4',
    actionBg: '#d4ebc2',
    actionBorder: '#9fcf80',
    actionLabel: '🌿 Harvest now',
    actionText: 'Use a sharp, CRI-certified peeling knife. Cut at 6 cm above ground at a 45° angle. Peel within 2–4 hours and dry in shade for 5–7 days.',
    chips: [
      { label: 'Height ✓',    color: '#2d6a30', bg: '#d4ebc2', dot: '#3d8c40' },
      { label: 'Thickness ✓', color: '#2d6a30', bg: '#d4ebc2', dot: '#3d8c40' },
      { label: 'Age ✓',       color: '#2d6a30', bg: '#d4ebc2', dot: '#3d8c40' },
    ],
  },
  'Borderline': {
    label: '⏳ Almost Ready',
    tagline: 'Getting very close. Re-assess in 2–6 weeks as key indicators are still developing.',
    icon: 'clock',
    accent: '#7a5a10',
    bg: '#fdf3dc',
    border: '#e8d090',
    iconBg: '#f5e4a0',
    actionBg: '#faeeda',
    actionBorder: '#e8c870',
    actionLabel: '⏳ Wait & monitor',
    actionText: 'Do not harvest yet. Check height, trunk thickness, and bark texture weekly. Water stress can delay readiness by 2–3 weeks.',
    chips: [
      { label: 'Height ~',    color: '#7a5a10', bg: '#fdf3dc', dot: '#c49a20' },
      { label: 'Thickness ~', color: '#7a5a10', bg: '#fdf3dc', dot: '#c49a20' },
    ],
  },
  'Not Ready': {
    label: '🔵 Not Ready Yet',
    tagline: 'This shoot needs more time to develop. Check again in 6–8 weeks.',
    icon: 'x',
    accent: '#1a3f6a',
    bg: '#e0ecf8',
    border: '#a0c4ee',
    iconBg: '#b8d4f0',
    actionBg: '#d8eaf8',
    actionBorder: '#90bce8',
    actionLabel: '🚫 Do not harvest',
    actionText: 'Harvesting too early severely reduces bark thickness and oil content. Allow the shoot to keep growing and re-check in 6–8 weeks.',
    chips: [
      { label: 'Height ✗',        color: '#1a3f6a', bg: '#d8eaf8', dot: '#3a72b0' },
      { label: 'More time needed', color: '#1a3f6a', bg: '#d8eaf8', dot: '#3a72b0' },
    ],
  },
};

const CONF_COLORS = { 'Ready': '#3d8c40', 'Borderline': '#c49a20', 'Not Ready': '#3a72b0' };

function reasonEmoji(text) {
  const t = text.toLowerCase();
  if (/height|tall|cm/.test(t))            return '📏';
  if (/trunk|circumference|thick/.test(t)) return '🌀';
  if (/month|age|old/.test(t))             return '📅';
  if (/leaf|leaves/.test(t))              return '🌿';
  if (/bark|texture|peel|rough/.test(t))  return '🪵';
  if (/straight/.test(t))                 return '📐';
  return '•';
}

// ─── Physical Data Card ───────────────────────────────────────────────────────
function PhysicalCard({ fields, setFields }) {
  const barkOptions = ['Light Brown', 'Dark Brown', 'Grey/Rough'];
  return (
    <div className="ch-card" style={{ animationDelay: '.05s' }}>
      <div className="ch-card-hdr">
        <div className="ch-card-title">Physical Data</div>
      </div>
      <div className="ch-card-body">
        <div className="ch-field-row">
          <div>
            <label className="ch-field-label">Shoot Height</label>
            <div className="ch-field-input-wrap">
              <input className="ch-field-input" type="number" placeholder="e.g. 145"
                value={fields.shoot_height_cm ?? ''} step="1" min="10" max="300"
                onChange={e => setFields(f => ({ ...f, shoot_height_cm: e.target.value }))} />
              <span className="ch-field-unit">cm</span>
            </div>
          </div>
          <div>
            <label className="ch-field-label">Trunk Circle</label>
            <div className="ch-field-input-wrap">
              <input className="ch-field-input" type="number" placeholder="e.g. 3.5"
                value={fields.trunk_circumference_cm ?? ''} step="0.1"
                onChange={e => setFields(f => ({ ...f, trunk_circumference_cm: e.target.value }))} />
              <span className="ch-field-unit">cm</span>
            </div>
          </div>
        </div>

        <div className="ch-field-row single" style={{ marginBottom: 12 }}>
          <label className="ch-field-label">Shoot Age (Months)</label>
          <div className="ch-field-input-wrap">
            <input className="ch-field-input" type="number" placeholder="e.g. 24"
              value={fields.shoot_age_months ?? ''}
              onChange={e => setFields(f => ({ ...f, shoot_age_months: e.target.value }))} />
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label className="ch-field-label">Bark Color</label>
          <div className="ch-toggle-group">
            {barkOptions.map(opt => (
              <button key={opt}
                className={`ch-toggle ${fields.bark_color === opt ? 'active' : ''}`}
                onClick={() => setFields(f => ({ ...f, bark_color: f.bark_color === opt ? '' : opt }))}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── More Physical Attributes ─────────────────────────────────────────────────
function MoreAttributesCard({ fields, setFields }) {
  const textureOptions  = ['Smooth', 'Rough', 'Peeling'];
  const straightOptions = ['Straight', 'Slight Curve', 'Curved'];
  const leafColorOptions = ['Dark Green', 'Green', 'Yellowish'];
  return (
    <div className="ch-card" style={{ animationDelay: '.08s' }}>
      <div className="ch-card-hdr">
        <div className="ch-card-title">Additional Attributes</div>
      </div>
      <div className="ch-card-body">
        <div className="ch-field-row single" style={{ marginBottom: 12 }}>
          <label className="ch-field-label">Number of Leaves</label>
          <div className="ch-field-input-wrap">
            <input className="ch-field-input" type="number" placeholder="e.g. 16"
              value={fields.num_leaves ?? ''}
              onChange={e => setFields(f => ({ ...f, num_leaves: e.target.value }))} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="ch-field-label">Leaf Colour</label>
          <div className="ch-toggle-group">
            {leafColorOptions.map(opt => (
              <button key={opt}
                className={`ch-toggle ${fields.leaf_color === opt ? 'active' : ''}`}
                onClick={() => setFields(f => ({ ...f, leaf_color: f.leaf_color === opt ? '' : opt }))}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="ch-field-label">Bark Texture</label>
          <div className="ch-toggle-group">
            {textureOptions.map(opt => (
              <button key={opt}
                className={`ch-toggle ${fields.bark_texture === opt ? 'active' : ''}`}
                onClick={() => setFields(f => ({ ...f, bark_texture: f.bark_texture === opt ? '' : opt }))}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="ch-field-label">Shoot Straightness</label>
          <div className="ch-toggle-group">
            {straightOptions.map(opt => (
              <button key={opt}
                className={`ch-toggle ${fields.straightness === opt ? 'active' : ''}`}
                onClick={() => setFields(f => ({ ...f, straightness: f.straightness === opt ? '' : opt }))}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Visual Data Card ─────────────────────────────────────────────────────────
function VisualCard({ images, setImages }) {
  const slots = ['Front', 'Side L', 'Side R'];
  const inputRefs = [useRef(), useRef(), useRef()];

  const handleFile = (idx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImages(prev => { const n = [...prev]; n[idx] = { file, url }; return n; });
  };
  const removeImg = (idx, e) => {
    e.stopPropagation();
    setImages(prev => { const n = [...prev]; n[idx] = null; return n; });
  };
  const filled = images.filter(Boolean).length;

  return (
    <div className="ch-card" style={{ animationDelay: '.1s' }}>
      <div className="ch-card-hdr">
        <div className="ch-card-title">Visual Data</div>
        <div className="ch-card-badge blue">CNN Ensemble</div>
      </div>
      <div className="ch-card-body">
        <div className="ch-cam-label">
          Trunk Angles <span className="ch-cam-count">({filled}/3)</span>
        </div>
        <div className="ch-cam-slots">
          {slots.map((label, i) => (
            <div key={label}
              className={`ch-cam-slot ${images[i] ? 'filled' : ''}`}
              onClick={() => inputRefs[i].current?.click()}>
              <input ref={inputRefs[i]} type="file" accept="image/*" capture="environment"
                className="ch-cam-input" onChange={e => handleFile(i, e)} />
              {images[i]
                ? <>
                    <img src={images[i].url} alt={label} />
                    <button className="ch-cam-slot-remove" onClick={e => removeImg(i, e)}>×</button>
                  </>
                : <>
                    <div className="ch-cam-slot-icon"><Icon name="camera" size={22} /></div>
                    <div className="ch-cam-slot-label">{label}</div>
                  </>
              }
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: '.68rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          Photos are processed locally. Capture all 3 angles for highest accuracy.
        </div>
      </div>
    </div>
  );
}

// ─── Optional Text Notes ──────────────────────────────────────────────────────
function NotesCard({ text, setText, recording, onMic }) {
  return (
    <div className="ch-card" style={{ animationDelay: '.12s' }}>
      <div className="ch-card-hdr">
        <div className="ch-card-title">Additional Notes</div>
        <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Optional</span>
      </div>
      <div className="ch-card-body">
        <div className="ch-ta-wrap">
          <textarea className="ch-ta" value={text} onChange={e => setText(e.target.value)}
            placeholder={'Any extra observations, e.g. "slight yellowing on outer leaves, grown on hillside plot"'} />
          <button className={`ch-mic ${recording ? 'rec' : 'idle'}`} onClick={onMic}
            title={recording ? 'Stop' : 'Voice note'}>
            <Icon name={recording ? 'stop' : 'mic'} size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Result Section ───────────────────────────────────────────────────────────
function ResultSection({ result }) {
  const v = VERDICT[result.prediction] || VERDICT['Not Ready'];

  return (
    <>
      {/* ── 1. Verdict banner ── */}
      <div className="ch-verdict" style={{ background: v.bg, border: `1px solid ${v.border}` }}>
        <div className="ch-verdict-top">
          <div className="ch-verdict-ico" style={{ background: v.iconBg, color: v.accent }}>
            <Icon name={v.icon} size={22} />
          </div>
          <div className="ch-verdict-text">
            <div className="ch-verdict-label" style={{ color: v.accent }}>{v.label}</div>
            <div className="ch-verdict-tagline" style={{ color: v.accent }}>{v.tagline}</div>
          </div>
        </div>

        <div className="ch-chips">
          {v.chips.map((chip, i) => (
            <span key={i} className="ch-chip"
              style={{ background: chip.bg, color: chip.color, borderColor: v.border }}>
              <span className="ch-chip-dot" style={{ background: chip.dot }} />
              {chip.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── 2. Action box ── */}
      <div className="ch-action-box"
        style={{ background: v.actionBg, border: `1.5px solid ${v.actionBorder}` }}>
        <div className="ch-action-box-head" style={{ color: v.accent }}>
          <Icon
            name={result.prediction === 'Ready' ? 'scissor' : result.prediction === 'Borderline' ? 'clock' : 'sprout'}
            size={16}
          />
          {v.actionLabel}
        </div>
        <div className="ch-action-box-body" style={{ color: v.accent }}>{v.actionText}</div>
      </div>

      {/* ── 3. Model Confidence ── */}
      <div className="ch-card">
        <div className="ch-card-hdr">
          <div className="ch-card-title">Model Confidence</div>
          <Icon name="chart" size={14} />
        </div>
        <div className="ch-card-body">
          {['Ready', 'Borderline', 'Not Ready'].map(key => (
            <div className="ch-conf-row" key={key}>
              <div className="ch-conf-name">{key}</div>
              <div className="ch-conf-track">
                <div className="ch-conf-fill"
                  style={{ width: `${result.confidence?.[key] ?? 0}%`, background: CONF_COLORS[key] }} />
              </div>
              <div className="ch-conf-pct" style={{ color: CONF_COLORS[key] }}>
                {Math.round(result.confidence?.[key] ?? 0)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Analysis Details ── */}
      {result.reasons?.length > 0 && (
        <div className="ch-card">
          <div className="ch-card-hdr">
            <div className="ch-card-title">Why this result?</div>
          </div>
          <div className="ch-card-body">
            <div className="ch-reasons">
              {result.reasons.map((r, i) => (
                <div className="ch-reason" key={i} style={{ animationDelay: `${i * 0.06}s` }}>
                  <span className="ch-reason-icon">{reasonEmoji(r)}</span>
                  <div className="ch-reason-txt">{r}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Next steps ── */}
      {result.guidelines?.steps?.length > 0 && (
        <>
          <div className="ch-section-lbl">What to do next</div>
          <div className="ch-card">
            <div className="ch-card-body" style={{ paddingTop: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {result.guidelines.steps.map((step, i) => {
                  const clean = step
                    .replace(/^[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}⏳🚫🌿🔪📏⏱️📦📋💧🌱🐛]+\s*/u, '')
                    .replace(/\*\*/g, '');
                  return (
                    <div className="ch-guide-step" key={i} style={{ animationDelay: `${i * 0.06}s` }}>
                      <div className="ch-guide-num">{i + 1}</div>
                      <div style={{ flex: 1 }}>{clean}</div>
                    </div>
                  );
                })}
              </div>
              {result.guidelines.recheck && (
                <div className="ch-recheck"
                  style={{ marginTop: 12, background: v.bg, borderColor: v.border, color: v.accent }}>
                  <Icon name="clock" size={14} />
                  Re-assess in approximately <strong style={{ marginLeft: 4 }}>{result.guidelines.recheck}</strong>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── 6. Low-confidence nudge ── */}
      {result.completeness && !result.completeness.is_reliable && (
        <div className="ch-low-conf">
          <span className="ch-low-conf-icon">⚠️</span>
          <div>
            <strong>Low confidence result.</strong> Add more details to improve accuracy
            {result.completeness.missing_fields?.length > 0 && (
              <> — try: {result.completeness.missing_fields.slice(0, 3).join(', ')}</>
            )}.
          </div>
        </div>
      )}
    </>
  );
}

// ─── Confirm Clear Modal ──────────────────────────────────────────────────────
function ClearModal({ onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(28,36,25,.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'fadeIn .18s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        padding: '24px 20px 36px',
        boxShadow: '0 -8px 32px rgba(0,0,0,.13)',
        animation: 'fadeUp .22s var(--ease)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: '#fff0ec', border: '1px solid #f4cfc2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Icon name="refresh" size={22} style={{ color: 'var(--danger)' }} />
          </div>
          <div style={{ fontSize: '.98rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Clear all data?
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            This will reset all measurements, photos, notes, and results. This cannot be undone.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, height: 48, borderRadius: 13,
            border: '1.5px solid var(--border)', background: 'var(--surface2)',
            fontFamily: "'Sora', sans-serif", fontSize: '.85rem', fontWeight: 600,
            color: 'var(--text2)', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, height: 48, borderRadius: 13,
            border: 'none', background: 'var(--danger)',
            fontFamily: "'Sora', sans-serif", fontSize: '.85rem', fontWeight: 700,
            color: '#fff', cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(176,74,42,.35)',
          }}>
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const INITIAL_FIELDS = {
  shoot_height_cm: '', trunk_circumference_cm: '',
  shoot_age_months: '', bark_color: '',
  num_leaves: '', leaf_color: '', bark_texture: '', straightness: '',
};

export default function CinnamonHarvest() {
  useCSS();

  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [images, setImages]       = useState([null, null, null]);
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [statusMsg, setMsg]       = useState('');
  const [error, setError]         = useState('');
  const [result, setResult]       = useState(null);
  const [recording, setRec]       = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const recRef    = useRef(null);
  const resultRef = useRef(null);

  const filledCount = Object.values(fields).filter(v => v !== '' && v !== null).length
    + images.filter(Boolean).length
    + (notes.trim() ? 1 : 0);
  const canAnalyse = filledCount >= 2 && !loading;

  // ── Clear handler ──
  const handleClear = useCallback(() => {
    setFields(INITIAL_FIELDS);
    setImages([null, null, null]);
    setNotes('');
    setResult(null);
    setError('');
    setMsg('');
    setShowClearModal(false);
    // Stop any active recording
    if (recRef.current) { recRef.current.stop(); setRec(false); }
    // Scroll back to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Voice input not supported. Use Chrome or Edge.'); return; }
    if (recording) { recRef.current?.stop(); setRec(false); return; }
    const rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
    recRef.current = rec;
    const base = notes;
    rec.onresult = e => {
      let interim = '', final = base;
      for (const r of e.results) {
        if (r.isFinal) final += (final ? ' ' : '') + r[0].transcript;
        else interim = r[0].transcript;
      }
      setNotes(final + (interim ? ' ' + interim : ''));
    };
    rec.onerror = () => setRec(false);
    rec.onend   = () => setRec(false);
    rec.start(); setRec(true);
  }, [recording, notes]);

  const analyse = useCallback(async () => {
    if (!canAnalyse) return;
    setLoading(true); setError(''); setResult(null);

    const parts = [];
    if (fields.shoot_height_cm)        parts.push(`height ${fields.shoot_height_cm} cm`);
    if (fields.trunk_circumference_cm) parts.push(`trunk circumference ${fields.trunk_circumference_cm} cm`);
    if (fields.shoot_age_months)       parts.push(`age ${fields.shoot_age_months} months`);
    if (fields.bark_color)             parts.push(`${fields.bark_color.toLowerCase()} bark`);
    if (fields.num_leaves)             parts.push(`${fields.num_leaves} leaves`);
    if (fields.leaf_color)             parts.push(`${fields.leaf_color.toLowerCase()} leaves`);
    if (fields.bark_texture)           parts.push(`${fields.bark_texture.toLowerCase()} texture`);
    if (fields.straightness)           parts.push(`${fields.straightness.toLowerCase()} shoot`);
    if (notes.trim())                  parts.push(notes.trim());
    const text = parts.join(', ');

    try {
      setMsg('Reading your data…');
      const pr = await fetch(`${API_BASE}/api/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!pr.ok) throw new Error(`Parse error (${pr.status})`);
      const { fields: pf, completeness: pc } = await pr.json();

      setMsg('Running harvest readiness model…');
      const rr = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: pf, completeness: pc }),
      });
      if (!rr.ok) {
        const body = await rr.json();
        if (body.error === 'insufficient_data') throw new Error(body.message || 'Not enough data.');
        throw new Error(`Predict error (${rr.status})`);
      }
      setResult(await rr.json());
      setMsg('');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    } catch (e) {
      setError(e.message); setMsg('');
    } finally {
      setLoading(false);
    }
  }, [canAnalyse, fields, notes]);

  return (
    <div className="ch">
      {/* Confirm modal */}
      {showClearModal && (
        <ClearModal
          onConfirm={handleClear}
          onCancel={() => setShowClearModal(false)}
        />
      )}

      {/* Top Bar */}
      <div className="ch-bar">
        <div className="ch-bar-back"><Icon name="back" size={16} /></div>
        <div style={{ flex: 1 }}>
          <div className="ch-bar-title">Harvest Check</div>
        </div>
        <button
          onClick={() => setShowClearModal(true)}
          title="Reset all fields"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 50,
            border: '1.5px solid #a0c080',
            background: '#e0efd4',
            fontFamily: "'Sora', sans-serif",
            fontSize: '.74rem', fontWeight: 700,
            color: '#2d4a2a', cursor: 'pointer',
            flexShrink: 0, letterSpacing: '.01em',
            boxShadow: '0 2px 8px rgba(45,74,42,.13)',
            transition: 'all .18s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#c8dbb8';
            e.currentTarget.style.borderColor = '#2d4a2a';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(45,74,42,.25)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#e0efd4';
            e.currentTarget.style.borderColor = '#a0c080';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,74,42,.13)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#2d4a2a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          Reset
        </button>
      </div>

      {/* Subtitle */}
      <p className="ch-subtitle">
        This dual-model system fuses physical measurements (LightGBM) with multi-angle visual
        data (CNN Ensemble) for a highly accurate readiness score.
      </p>

      {/* Body */}
      <div className="ch-body">
        <PhysicalCard fields={fields} setFields={setFields} />
        <MoreAttributesCard fields={fields} setFields={setFields} />
        <VisualCard images={images} setImages={setImages} />
        <NotesCard text={notes} setText={setNotes} recording={recording} onMic={toggleMic} />

        {loading && statusMsg && (
          <div className="ch-loading">
            <div className="ch-spin" />{statusMsg}
          </div>
        )}

        {error && (
          <div className="ch-err">
            <div className="ch-err-head"><Icon name="warn" size={14} />Error</div>
            <div className="ch-err-body">{error}</div>
          </div>
        )}

        <div ref={resultRef}>
          {result && (
            <>
              <div className="ch-section-lbl" style={{ animationDelay: '0.04s' }}>Result</div>
              <ResultSection result={result} />
            </>
          )}
        </div>

        <div className="ch-footer">
          CinnamonHarvest AI · CCGI Data · For guidance only — confirm with a field agronomist.
        </div>
      </div>

      {/* Fixed CTA */}
      <div className="ch-cta-bar">
        <button
          className={`ch-cta ${loading ? 'loading' : canAnalyse ? 'unlocked' : 'locked'}`}
          onClick={analyse} disabled={!canAnalyse}>
          {loading && <div className="ch-cta-shimmer" />}
          {loading
            ? <><div className="ch-spin" style={{ borderTopColor: '#fff' }} />Analysing…</>
            : canAnalyse
              ? <><Icon name="search" size={18} />Check Harvest Readiness</>
              : <><Icon name="lock" size={16} />Complete Data Required</>
          }
        </button>
      </div>
    </div>
  );
}
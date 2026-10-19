/** Original flat illustrations for the site (drawn in code, no photos, no licences, a few KB each). Fixed colours work in light and dark. */
const person = (x: number, y: number, body: string, scale = 1, skin = "#B9805A", hair = "#2B2320") => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x="-9" y="-6" width="18" height="38" rx="9" fill={body} />
    <rect x="-8" y="30" width="6" height="22" rx="3" fill="#3B4A57" /><rect x="2" y="30" width="6" height="22" rx="3" fill="#3B4A57" />
    <circle cx="0" cy="-16" r="9" fill={skin} /><path d="M-9-17a9 9 0 0 1 18 0c-4-4-14-4-18 0z" fill={hair} />
  </g>);

export function VillageScene({ className = "" }: { className?: string }) {
  return <svg className={"art " + className} viewBox="0 0 640 380" role="img" aria-label="Illustration: a village with fields, a health centre and people walking along a path">
    <defs>
      <linearGradient id="vs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#BFE8DC" /><stop offset="1" stopColor="#FFE9C7" /></linearGradient>
      <linearGradient id="vs-field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7CC48A" /><stop offset="1" stopColor="#4FA36A" /></linearGradient>
    </defs>
    <rect width="640" height="380" rx="22" fill="url(#vs-sky)" />
    <circle cx="500" cy="92" r="42" fill="#FFD27A" /><circle cx="500" cy="92" r="58" fill="#FFD27A" opacity=".25" />
    <path d="M0 215c70-40 130-40 200-8s130 24 200-12 150-24 240 14v171H0z" fill="#8FD0A0" />
    <path d="M0 250c90-34 170-30 250-6s200 22 390-8v144H0z" fill="url(#vs-field)" />
    {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${-20 + i * 6} ${300 + i * 14}C200 ${270 + i * 14} 420 ${330 + i * 14} 660 ${285 + i * 14}`} fill="none" stroke="#3E8F5A" strokeWidth="3" opacity=".45" />)}
    {/* health centre */}
    <g transform="translate(250 168)">
      <rect x="0" y="22" width="130" height="78" rx="6" fill="#FFFFFF" /><path d="M-8 24 65 0l73 24z" fill="#0D9274" />
      <rect x="52" y="58" width="26" height="42" rx="4" fill="#0B7F65" /><rect x="14" y="44" width="24" height="22" rx="3" fill="#C9F1E2" /><rect x="92" y="44" width="24" height="22" rx="3" fill="#C9F1E2" />
      <circle cx="65" cy="34" r="12" fill="#fff" /><path d="M62 27h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#D64545" />
    </g>
    {/* houses */}
    <g transform="translate(70 215)"><rect y="26" width="78" height="52" rx="4" fill="#F4D9B0" /><path d="M-8 30 39 0l47 30z" fill="#C2674A" /><rect x="30" y="46" width="18" height="32" rx="3" fill="#8A5A3C" /></g>
    <g transform="translate(470 222)"><rect y="22" width="70" height="46" rx="4" fill="#F6E3C4" /><path d="M-8 26 35 0l43 26z" fill="#B85C44" /><rect x="26" y="40" width="16" height="28" rx="3" fill="#8A5A3C" /></g>
    {/* trees */}
    {[[40, 250, 1], [200, 232, .8], [560, 248, 1.1]].map(([x, y, s], i) => <g key={i} transform={`translate(${x} ${y}) scale(${s})`}><rect x="-4" y="14" width="8" height="34" rx="3" fill="#7A5A3A" /><circle cx="0" cy="6" r="24" fill="#3E8F5A" /><circle cx="-14" cy="18" r="16" fill="#4FA36A" /><circle cx="14" cy="18" r="16" fill="#4FA36A" /></g>)}
    {/* path */}
    <path d="M300 268c-10 28-60 40-120 62-40 14-90 30-130 50h130c50-14 100-28 150-50 40-18 60-40 70-62z" fill="#F1D9A8" opacity=".9" />
    {person(255, 300, "#0D9274", .9)}{person(290, 308, "#E0A23B", .7, "#C08A62")}{person(430, 320, "#7FB4F5", .85, "#A8714E")}
    {/* water pot */}
    <g transform="translate(118 330)"><ellipse cx="0" cy="22" rx="16" ry="5" fill="#000" opacity=".12" /><path d="M-12 0h24c6 6 8 16 0 22h-24c-8-6-6-16 0-22z" fill="#C2674A" /><rect x="-7" y="-6" width="14" height="8" rx="3" fill="#A9553C" /></g>
    {/* birds */}
    <path d="M120 80c8-8 14-8 20 0M150 62c8-8 14-8 20 0" fill="none" stroke="#2F6F5E" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

export function WaterScene({ className = "" }: { className?: string }) {
  return <svg className={"art " + className} viewBox="0 0 640 260" role="img" aria-label="Illustration: a family washing hands at a tap and filling a clean water pot">
    <defs><linearGradient id="ws-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E3F7EF" /><stop offset="1" stopColor="#C9E8F7" /></linearGradient></defs>
    <rect width="640" height="260" rx="20" fill="url(#ws-bg)" />
    <circle cx="540" cy="60" r="30" fill="#FFD27A" />
    <rect y="200" width="640" height="60" fill="#8FD0A0" /><rect y="200" width="640" height="60" rx="0" fill="#7CC48A" opacity=".6" />
    {/* tap stand */}
    <g transform="translate(300 90)"><rect x="0" y="40" width="14" height="110" rx="4" fill="#6B7C86" /><path d="M7 40V18h46v12" fill="none" stroke="#6B7C86" strokeWidth="12" strokeLinejoin="round" /><rect x="40" y="28" width="26" height="10" rx="4" fill="#4F5F69" />
      <path d="M58 40c0 18 0 26-6 38" stroke="#5DADEB" strokeWidth="5" strokeLinecap="round" fill="none" /><circle cx="52" cy="86" r="4" fill="#5DADEB" /><circle cx="48" cy="98" r="3" fill="#5DADEB" opacity=".7" />
      <rect x="-30" y="150" width="130" height="10" rx="5" fill="#9AA8B0" /></g>
    {/* child washing */}
    {person(430, 120, "#E0A23B", 1.1, "#B9805A")}
    <path d="M410 128l-22 24M450 128l-14 22" stroke="#B9805A" strokeWidth="7" strokeLinecap="round" />
    <circle cx="372" cy="170" r="6" fill="#fff" opacity=".9" /><circle cx="382" cy="162" r="4" fill="#fff" opacity=".9" /><circle cx="364" cy="160" r="3" fill="#fff" opacity=".9" />
    {/* mother with pot */}
    {person(150, 118, "#D64545", 1.15, "#A8714E", "#1E1A18")}
    <g transform="translate(150 66)"><path d="M-14 0h28c8 8 10 20 0 28h-28c-10-8-8-20 0-28z" fill="#C2674A" /><rect x="-8" y="-8" width="16" height="10" rx="4" fill="#A9553C" /></g>
    <path d="M135 120l-10 26M165 120l12 22" stroke="#A8714E" strokeWidth="7" strokeLinecap="round" />
    {/* soap and bucket */}
    <g transform="translate(240 190)"><rect width="30" height="16" rx="5" fill="#fff" /><rect x="3" y="3" width="24" height="10" rx="4" fill="#C9F1E2" /></g>
    <g transform="translate(520 160)"><path d="M0 0h50l-6 46h-38z" fill="#5DADEB" /><path d="M0 0h50" stroke="#3F8FCB" strokeWidth="6" /></g>
  </svg>;
}

export function ClinicScene({ className = "" }: { className?: string }) {
  return <svg className={"art " + className} viewBox="0 0 640 260" role="img" aria-label="Illustration: a health worker talking with a villager outside a health centre">
    <defs><linearGradient id="cs-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D9F2E8" /><stop offset="1" stopColor="#FFF1D6" /></linearGradient></defs>
    <rect width="640" height="260" rx="20" fill="url(#cs-bg)" />
    <rect y="196" width="640" height="64" fill="#9AD3A8" />
    <g transform="translate(330 40)"><rect x="0" y="30" width="250" height="126" rx="8" fill="#fff" /><path d="M-10 34 125 0l135 34z" fill="#0D9274" />
      <rect x="100" y="76" width="50" height="80" rx="6" fill="#0B7F65" /><rect x="24" y="64" width="46" height="36" rx="4" fill="#C9F1E2" /><rect x="180" y="64" width="46" height="36" rx="4" fill="#C9F1E2" />
      <circle cx="125" cy="52" r="14" fill="#fff" /><path d="M121 44h8v6h6v8h-6v6h-8v-6h-6v-8h6z" fill="#D64545" /></g>
    {/* health worker with bag */}
    {person(150, 120, "#FFFFFF", 1.2, "#A8714E", "#1E1A18")}
    <path d="M141 118h18v30h-18z" fill="#0D9274" opacity=".0" /><rect x="128" y="132" width="18" height="16" rx="3" fill="#D64545" /><path d="M134 140h6M137 137v6" stroke="#fff" strokeWidth="2.5" />
    <path d="M140 74a9 9 0 0 1 20 0" fill="none" stroke="#E0A23B" strokeWidth="0" />
    {/* villager */}
    {person(240, 126, "#7FB4F5", 1.1, "#B9805A", "#3A2F2A")}
    <rect x="262" y="150" width="3" height="46" rx="1.5" fill="#7A5A3A" />
    {/* speech */}
    <g transform="translate(180 30)"><rect width="84" height="36" rx="14" fill="#fff" /><path d="M24 36l-8 14 22-14z" fill="#fff" /><circle cx="26" cy="18" r="4" fill="#0D9274" /><circle cx="42" cy="18" r="4" fill="#0D9274" /><circle cx="58" cy="18" r="4" fill="#0D9274" /></g>
    <path d="M60 210c60-10 140-10 220 0" stroke="#F1D9A8" strokeWidth="10" strokeLinecap="round" fill="none" />
  </svg>;
}

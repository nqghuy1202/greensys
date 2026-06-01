/* Inline SVG icon components — Lucide-style stroke icons */
/* Exposes window.Icons */

const Icon = ({ d, size = 16, stroke = 2, fill = 'none', children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  Close:  (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>,
  Search: (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>,
  Plus:   (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>,
  More:   (p) => <Icon {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>,
  PanelR: (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></Icon>,
  Pin:    (p) => <Icon {...p}><path d="M12 17v5M9 10.76V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4.76a2 2 0 0 0 .79 1.58l1.42 1.06a1 1 0 0 1 .39.79V15a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-.81a1 1 0 0 1 .39-.79l1.42-1.06A2 2 0 0 0 9 10.76Z" /></Icon>,
  Smile:  (p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></Icon>,
  Paperclip:(p) => <Icon {...p}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.84l-8.59 8.59a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Icon>,
  Send:   (p) => <Icon {...p}><path d="m22 2-7 20-4-9-9-4 20-7Z" /></Icon>,
  At:     (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></Icon>,
  Reply:  (p) => <Icon {...p}><path d="M9 17 4 12l5-5M4 12h11a4 4 0 0 1 0 8h-2" /></Icon>,
  Heart:  (p) => <Icon {...p}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" /></Icon>,
  Edit:   (p) => <Icon {...p}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>,
  Trash:  (p) => <Icon {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>,
  File:   (p) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></Icon>,
  FilePdf:(p) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" /></Icon>,
  FileXls:(p) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="m9 13 2 3-2 3M14 13l-2 3 2 3" /></Icon>,
  Image:  (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></Icon>,
  Check:  (p) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>,
  CheckCheck: (p) => <Icon {...p}><path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16" /></Icon>,
  Users:  (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>,
  User:   (p) => <Icon {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>,
  ChevDown:(p) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>,
  ChevRight:(p) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>,
  Filter: (p) => <Icon {...p}><path d="M22 3H2l8 9.46V19l4 2v-8.54Z" /></Icon>,
  Print:  (p) => <Icon {...p}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></Icon>,
  ExtLink:(p) => <Icon {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></Icon>,
  Save:   (p) => <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></Icon>,
  CircleCheck:(p) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Icon>,
  Hash:   (p) => <Icon {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></Icon>,
  ArrowLeft:(p) => <Icon {...p}><path d="m12 19-7-7 7-7M19 12H5" /></Icon>,
  X:      (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>,
  Sparkles:(p) => <Icon {...p}><path d="M12 3l1.9 5.8L20 11l-6.1 1.9L12 19l-1.9-5.8L4 11l5.8-2L12 3z" /></Icon>,
  FileText:(p) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" /></Icon>,
  Logo:   (p) => <Icon {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></Icon>,
};

window.Icons = Icons;

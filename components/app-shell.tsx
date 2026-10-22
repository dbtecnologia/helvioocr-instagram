"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Bell, ClipboardCheck, FileBarChart, FileCog, Gauge, Menu, PackageSearch, Settings, Store, UploadCloud, Workflow, X } from "lucide-react";

const groups = [
  { label: "Visão geral", items: [{ href: "/dashboard", label: "Dashboard", icon: Gauge }] },
  { label: "Operação", items: [{ href: "/supermarkets", label: "Supermercados", icon: Store }, { href: "/coleta", label: "Coleta de encartes", icon: UploadCloud }, { href: "/review", label: "Revisão de ofertas", icon: ClipboardCheck }] },
  { label: "Inteligência", items: [{ href: "/compare", label: "Comparador", icon: BarChart3 }, { href: "/products", label: "Produtos", icon: PackageSearch }, { href: "/history", label: "Histórico", icon: FileBarChart }] },
  { label: "Gestão", items: [{ href: "/reports", label: "Relatórios", icon: FileCog }, { href: "/automations", label: "Automações", icon: Workflow }, { href: "/settings", label: "Configurações", icon: Settings }] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <div className="app-shell">
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><BarChart3 size={19} /></div><div><strong>PriceScan IA</strong><small>inteligência de varejo</small></div></div>
      <nav aria-label="Navegação principal">
        {groups.map((group) => <div key={group.label}><div className="nav-section">{group.label}</div>{group.items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={pathname === item.href ? "page" : undefined} className={`nav-link ${pathname === item.href ? "active" : ""}`}><Icon className="nav-icon" />{item.label}</Link>; })}</div>)}
      </nav>
      <div className="sidebar-footer"><div className="user-chip"><div className="avatar">AD</div><div><strong>Administrador</strong><span>ambiente privado</span></div></div></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen((value) => !value)} aria-label={open ? "Fechar menu" : "Abrir menu"}>{open ? <X size={17} /> : <Menu size={17} />}</button><div className="breadcrumb"><span>PriceScan IA</span><span> / </span><strong>{groups.flatMap((group) => group.items).find((item) => item.href === pathname)?.label ?? "Dashboard"}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notificações"><Bell size={16} /></button><div className="avatar">AD</div></div></header>
      <main className="content">{children}</main>
    </div>
  </div>;
}

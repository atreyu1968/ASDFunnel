import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Library, 
  BookOpen, 
  Filter, 
  Calendar as CalendarIcon,
  Mail,
  UserCheck,
  Globe,
  FileCode,
  Zap,
} from "lucide-react";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Panel de Control", icon: LayoutDashboard },
    { href: "/authors", label: "Autores", icon: Users },
    { href: "/series", label: "Series", icon: Library },
    { href: "/books", label: "Libros", icon: BookOpen },
    { href: "/funnel", label: "Embudo", icon: Filter },
    { href: "/calendar", label: "Calendario", icon: CalendarIcon },
    { href: "/mailing-lists", label: "Listas de Correo", icon: Mail },
    { href: "/subscribers", label: "Suscriptores", icon: UserCheck },
    { href: "/landing-pages", label: "Landing Pages", icon: Globe },
    { href: "/email-templates", label: "Plantillas Email", icon: FileCode },
    { href: "/automations", label: "Automatizaciones", icon: Zap },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <h1 className="text-lg font-bold tracking-tight text-primary uppercase">
            LENNOX HALE
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            Publishing Op
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-8 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}

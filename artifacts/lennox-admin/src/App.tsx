import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MainLayout } from "@/components/layout/main-layout";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Authors from "@/pages/authors";
import Series from "@/pages/series";
import Books from "@/pages/books";
import Funnel from "@/pages/funnel";
import Calendar from "@/pages/calendar";
import MailingLists from "@/pages/mailing-lists";
import Subscribers from "@/pages/subscribers";
import LandingPages from "@/pages/landing-pages";
import EmailTemplates from "@/pages/email-templates";
import Automations from "@/pages/automations";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function AppRouter() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/authors" component={Authors} />
        <Route path="/series" component={Series} />
        <Route path="/books" component={Books} />
        <Route path="/funnel" component={Funnel} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/mailing-lists" component={MailingLists} />
        <Route path="/subscribers" component={Subscribers} />
        <Route path="/landing-pages" component={LandingPages} />
        <Route path="/email-templates" component={EmailTemplates} />
        <Route path="/automations" component={Automations} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");

  useEffect(() => {
    fetch(`${API_BASE}api/auth/check`, { credentials: "include" })
      .then((res) => setAuth(res.ok ? "yes" : "no"))
      .catch(() => setAuth("no"));
  }, []);

  if (auth === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Cargando...</p>
      </div>
    );
  }

  if (auth === "no") {
    return <Login onLogin={() => setAuth("yes")} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MainLayout } from "@/components/layout/main-layout";
import Dashboard from "@/pages/dashboard";
import Authors from "@/pages/authors";
import Series from "@/pages/series";
import Books from "@/pages/books";
import Funnel from "@/pages/funnel";
import Calendar from "@/pages/calendar";
import MailingLists from "@/pages/mailing-lists";
import Subscribers from "@/pages/subscribers";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
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
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { 
  useGetPublicationCalendar, 
  getGetPublicationCalendarQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon } from "lucide-react";

export default function Calendar() {
  const { data: calendarEntries, isLoading } = useGetPublicationCalendar({
    query: { queryKey: getGetPublicationCalendarQueryKey() }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published": return <Badge className="bg-primary text-primary-foreground">Publicado</Badge>;
      case "scheduled": return <Badge className="bg-blue-500 text-white">Programado</Badge>;
      case "ready": return <Badge className="bg-green-600 text-white">Listo</Badge>;
      case "production": return <Badge className="bg-amber-500 text-white">Producción</Badge>;
      case "draft": return <Badge variant="outline">Borrador</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calendario de Lanzamientos</h2>
          <p className="text-muted-foreground">Línea de tiempo de publicaciones programadas.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : calendarEntries && calendarEntries.length > 0 ? (
        <div className="relative border-l border-border ml-3 space-y-8 py-4">
          {calendarEntries.map((entry) => {
            const dateStr = entry.scheduledDate || entry.publicationDate;
            const date = dateStr ? parseISO(dateStr) : null;
            
            return (
              <div key={entry.bookId} className="relative pl-8">
                {/* Timeline dot */}
                <div className="absolute w-4 h-4 bg-background border-2 border-primary rounded-full -left-[9px] top-1.5 shadow-[0_0_0_4px_hsl(var(--background))]" />
                
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="w-32 flex-shrink-0 pt-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-primary">
                      <CalendarIcon className="h-4 w-4" />
                      {date ? format(date, "MMM d, yyyy", { locale: es }) : "TBA"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 capitalize tracking-widest">
                      {entry.status === 'published' ? 'Lanzado' : 'Próximamente'}
                    </div>
                  </div>
                  
                  <Card className="flex-1 bg-card/50 hover:bg-card transition-colors">
                    <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="text-lg font-bold text-foreground">
                          {entry.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{entry.seriesName} #{entry.bookNumber}</span>
                          <span>•</span>
                          <span>{entry.authorPenName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.funnelRole === 'lead_magnet' && <Badge variant="secondary">Lead Magnet</Badge>}
                        {entry.funnelRole === 'traffic_entry' && <Badge variant="secondary">Entrada</Badge>}
                        {getStatusBadge(entry.status)}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <p className="text-muted-foreground">No hay lanzamientos programados.</p>
        </div>
      )}
    </div>
  );
}

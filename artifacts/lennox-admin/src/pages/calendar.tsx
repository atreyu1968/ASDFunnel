import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  useGetPublicationCalendar,
  getGetPublicationCalendarQueryKey,
  useListAuthors,
  useListSeries,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, Filter } from "lucide-react";

const languageLabels: Record<string, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  published: { label: "Publicado", className: "bg-primary text-primary-foreground" },
  scheduled: { label: "Programado", className: "bg-blue-500 text-white" },
  ready: { label: "Listo", className: "bg-green-600 text-white" },
  production: { label: "Producción", className: "bg-amber-500 text-white" },
  draft: { label: "Borrador", className: "border-border text-muted-foreground" },
};

export default function Calendar() {
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterSeries, setFilterSeries] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: calendarEntries, isLoading } = useGetPublicationCalendar({
    query: { queryKey: getGetPublicationCalendarQueryKey() },
  });

  const { data: authors } = useListAuthors();
  const { data: series } = useListSeries();

  const filteredEntries = useMemo(() => {
    if (!calendarEntries) return [];
    return calendarEntries.filter((entry) => {
      if (filterLanguage !== "all" && entry.language !== filterLanguage) return false;
      if (filterAuthor !== "all" && entry.authorPenName !== filterAuthor) return false;
      if (filterSeries !== "all" && entry.seriesName !== filterSeries) return false;
      if (filterStatus !== "all" && entry.status !== filterStatus) return false;
      return true;
    });
  }, [calendarEntries, filterLanguage, filterAuthor, filterSeries, filterStatus]);

  const uniqueLanguages = useMemo(() => {
    if (!calendarEntries) return [];
    return [...new Set(calendarEntries.map((e) => e.language).filter(Boolean))];
  }, [calendarEntries]);

  const uniqueAuthors = useMemo(() => {
    if (!calendarEntries) return [];
    return [...new Set(calendarEntries.map((e) => e.authorPenName).filter(Boolean))];
  }, [calendarEntries]);

  const uniqueSeries = useMemo(() => {
    if (!calendarEntries) return [];
    let seriesList = calendarEntries.map((e) => e.seriesName).filter(Boolean);
    if (filterAuthor !== "all") {
      seriesList = calendarEntries
        .filter((e) => e.authorPenName === filterAuthor)
        .map((e) => e.seriesName)
        .filter(Boolean);
    }
    return [...new Set(seriesList)];
  }, [calendarEntries, filterAuthor]);

  const stats = useMemo(() => {
    if (!calendarEntries) return { total: 0, published: 0, scheduled: 0, upcoming: 0 };
    const filtered = filteredEntries;
    return {
      total: filtered.length,
      published: filtered.filter((e) => e.status === "published").length,
      scheduled: filtered.filter((e) => e.status === "scheduled").length,
      upcoming: filtered.filter((e) => e.status !== "published").length,
    };
  }, [calendarEntries, filteredEntries]);

  const groupedByMonth = useMemo(() => {
    const groups: Record<string, typeof filteredEntries> = {};
    for (const entry of filteredEntries) {
      const dateStr = entry.scheduledDate || entry.publicationDate;
      const monthKey = dateStr ? format(parseISO(dateStr), "yyyy-MM") : "sin-fecha";
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(entry);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEntries]);

  const hasActiveFilters = filterLanguage !== "all" || filterAuthor !== "all" || filterSeries !== "all" || filterStatus !== "all";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calendario de Lanzamientos</h2>
          <p className="text-muted-foreground">Línea de tiempo de publicaciones por idioma, autor y serie.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total libros</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Publicados</div>
            <div className="text-2xl font-bold text-primary">{stats.published}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Programados</div>
            <div className="text-2xl font-bold text-blue-500">{stats.scheduled}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Próximamente</div>
            <div className="text-2xl font-bold text-amber-500">{stats.upcoming}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtrar:
        </div>

        <Select value={filterLanguage} onValueChange={(v) => setFilterLanguage(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Idioma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los idiomas</SelectItem>
            {uniqueLanguages.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {languageLabels[lang] || lang.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAuthor} onValueChange={(v) => { setFilterAuthor(v); setFilterSeries("all"); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Autor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los autores</SelectItem>
            {uniqueAuthors.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSeries} onValueChange={(v) => setFilterSeries(v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Serie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las series</SelectItem>
            {uniqueSeries.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="published">Publicados</SelectItem>
            <SelectItem value="scheduled">Programados</SelectItem>
            <SelectItem value="production">En producción</SelectItem>
            <SelectItem value="ready">Listos</SelectItem>
            <SelectItem value="draft">Borradores</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <button
            onClick={() => { setFilterLanguage("all"); setFilterAuthor("all"); setFilterSeries("all"); setFilterStatus("all"); }}
            className="text-xs text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filteredEntries.length > 0 ? (
        <div className="space-y-8">
          {groupedByMonth.map(([monthKey, entries]) => {
            const monthLabel =
              monthKey === "sin-fecha"
                ? "Sin fecha asignada"
                : format(parseISO(monthKey + "-01"), "MMMM yyyy", { locale: es });

            return (
              <div key={monthKey}>
                <h3 className="text-lg font-bold text-primary capitalize mb-4 border-b border-border pb-2">
                  {monthLabel}
                </h3>
                <div className="relative border-l border-border ml-3 space-y-6 py-2">
                  {entries.map((entry) => {
                    const dateStr = entry.scheduledDate || entry.publicationDate;
                    const date = dateStr ? parseISO(dateStr) : null;
                    const statusCfg = statusConfig[entry.status] || statusConfig.draft;

                    return (
                      <div key={entry.bookId} className="relative pl-8">
                        <div className="absolute w-4 h-4 bg-background border-2 border-primary rounded-full -left-[9px] top-1.5 shadow-[0_0_0_4px_hsl(var(--background))]" />

                        <div className="flex flex-col md:flex-row md:items-start gap-4">
                          <div className="w-32 flex-shrink-0 pt-1">
                            <div className="flex items-center gap-2 text-sm font-bold text-primary">
                              <CalendarIcon className="h-4 w-4" />
                              {date ? format(date, "MMM d", { locale: es }) : "TBA"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 capitalize tracking-widest">
                              {entry.status === "published" ? "Lanzado" : "Próximamente"}
                            </div>
                          </div>

                          <Card className="flex-1 bg-card/50 hover:bg-card transition-colors">
                            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="space-y-1">
                                <h4 className="text-lg font-bold text-foreground">{entry.title}</h4>
                                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                  <span className="font-medium text-foreground">
                                    {entry.seriesName} #{entry.bookNumber}
                                  </span>
                                  <span>•</span>
                                  <span>{entry.authorPenName}</span>
                                  {entry.language && (
                                    <>
                                      <span>•</span>
                                      <Badge variant="outline" className="text-xs">
                                        {entry.language.toUpperCase()}
                                      </Badge>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {entry.funnelRole === "lead_magnet" && (
                                  <Badge variant="secondary">Lead Magnet</Badge>
                                )}
                                {entry.funnelRole === "traffic_entry" && (
                                  <Badge variant="secondary">Entrada</Badge>
                                )}
                                {entry.funnelRole === "core_offer" && (
                                  <Badge variant="secondary">Oferta Principal</Badge>
                                )}
                                {entry.funnelRole === "crossover_bridge" && (
                                  <Badge variant="secondary">Crossover</Badge>
                                )}
                                <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "No hay libros que coincidan con los filtros seleccionados."
              : "No hay lanzamientos programados."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={() => { setFilterLanguage("all"); setFilterAuthor("all"); setFilterSeries("all"); setFilterStatus("all"); }}
              className="text-sm text-primary hover:underline mt-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

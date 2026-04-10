import { useState, useMemo } from "react";
import {
  useGetFunnelOverview,
  getGetFunnelOverviewQueryKey,
  useListAuthors,
  useListSeries,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, ArrowRight, ArrowDown } from "lucide-react";

const languageLabels: Record<string, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
};

export default function Funnel() {
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterSeries, setFilterSeries] = useState<string>("all");

  const { data: funnelData, isLoading } = useGetFunnelOverview({
    query: { queryKey: getGetFunnelOverviewQueryKey() }
  });

  const { data: authors } = useListAuthors();
  const { data: seriesList } = useListSeries();

  const filteredStages = useMemo(() => {
    if (!funnelData?.stages) return [];
    return funnelData.stages.map(stage => {
      const filtered = stage.books.filter(book => {
        if (filterLanguage !== "all" && book.language !== filterLanguage) return false;
        if (filterAuthor !== "all" && book.authorPenName !== filterAuthor) return false;
        if (filterSeries !== "all" && book.seriesName !== filterSeries) return false;
        return true;
      });
      return { ...stage, books: filtered, count: filtered.length };
    });
  }, [funnelData, filterLanguage, filterAuthor, filterSeries]);

  const filteredSeriesList = useMemo(() => {
    if (!seriesList) return [];
    if (filterAuthor === "all") return seriesList;
    return seriesList.filter(s => s.authorPenName === filterAuthor);
  }, [seriesList, filterAuthor]);

  const hasActiveFilters = filterLanguage !== "all" || filterAuthor !== "all" || filterSeries !== "all";

  const getStageColor = (role: string) => {
    switch (role) {
      case "lead_magnet": return "border-blue-500 bg-blue-500/10";
      case "traffic_entry": return "border-amber-500 bg-amber-500/10";
      case "core_offer": return "border-primary bg-primary/10";
      case "crossover_bridge": return "border-purple-500 bg-purple-500/10";
      default: return "border-border bg-card";
    }
  };

  const getPricingBadge = (strategy: string, price?: number | null) => {
    switch (strategy) {
      case "perma_free": return <Badge variant="secondary">Gratis</Badge>;
      case "promotional": return <Badge variant="outline" className="border-amber-500 text-amber-500">${price || 0.99}</Badge>;
      case "full_price": return <Badge variant="default">${price || 4.99}</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Embudo de Ventas</h2>
        <p className="text-muted-foreground">Visualización del flujo de lectores a través del catálogo.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtrar:
        </div>
        <Select value={filterLanguage} onValueChange={setFilterLanguage}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Idioma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los idiomas</SelectItem>
            {Object.entries(languageLabels).map(([code, label]) => (
              <SelectItem key={code} value={code}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAuthor} onValueChange={(v) => { setFilterAuthor(v); setFilterSeries("all"); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Autor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los autores</SelectItem>
            {authors?.map(a => (
              <SelectItem key={a.id} value={a.penName}>{a.penName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeries} onValueChange={setFilterSeries}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Serie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las series</SelectItem>
            {filteredSeriesList.map(s => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterLanguage("all"); setFilterAuthor("all"); setFilterSeries("all"); }}
            className="text-xs text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : filteredStages.length > 0 ? (
        <div className="relative flex flex-col md:flex-row gap-6 items-stretch w-full justify-between">
          {filteredStages.map((stage, index) => (
            <div key={stage.role} className="flex-1 flex flex-col min-w-0 z-10 w-full md:w-auto">
              <Card className={`h-full border-t-4 shadow-md ${getStageColor(stage.role).replace('bg-', 'border-t-').split(' ')[0]}`}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl flex items-center gap-2">
                      {stage.label}
                    </CardTitle>
                    <Badge variant="secondary" className="font-bold text-lg">{stage.count}</Badge>
                  </div>
                  <CardDescription>
                    {stage.role === "lead_magnet" && "Captación de emails"}
                    {stage.role === "traffic_entry" && "Entrada fría (D2D/Anuncios)"}
                    {stage.role === "core_offer" && "Monetización principal"}
                    {stage.role === "crossover_bridge" && "Transferencia de audiencia"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stage.books && stage.books.length > 0 ? (
                      stage.books.map(book => (
                        <div key={book.id} className="p-3 bg-muted/30 rounded-md border text-sm flex flex-col gap-2">
                          <div className="font-medium line-clamp-1">{book.title}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{book.seriesName}</span>
                            <span>•</span>
                            <span>{book.authorPenName}</span>
                            <Badge variant="outline" className="text-[10px] uppercase ml-auto">{book.language}</Badge>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            {getPricingBadge(book.pricingStrategy, book.price)}
                            <span className="text-[10px] uppercase tracking-wider opacity-70">{book.status}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground italic p-4 text-center">
                        Vacío
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              {index < filteredStages.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -mt-3 -mr-3 right-0 transform translate-x-full text-muted-foreground z-0" style={{left: `calc(${(index + 1) * (100 / filteredStages.length)}% - 12px)`}}>
                  <ArrowRight className="h-6 w-6 text-border" />
                </div>
              )}
              {index < filteredStages.length - 1 && (
                <div className="flex md:hidden justify-center py-2 text-muted-foreground">
                  <ArrowDown className="h-6 w-6 text-border" />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <p className="text-muted-foreground">No se pudo cargar el embudo.</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lógica de Adquisición</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          <p>
            <strong className="text-primary">Lead Magnet:</strong> Libros distribuidos gratuitamente a cambio del correo electrónico del lector. Nunca se monetizan directamente.
          </p>
          <p>
            <strong className="text-primary">Entrada de Tráfico:</strong> Libro 1 de las series principales. Optimizados para conversión, a menudo a precio reducido. Distribución amplia vía D2D (Amazon, Apple Books, Kobo, B&N, Google Play).
          </p>
          <p>
            <strong className="text-primary">Oferta Principal:</strong> Libros 2+ de la serie. Precio completo. Aquí es donde ocurre el ROI (Retorno de Inversión) de las campañas.
          </p>
          <p>
            <strong className="text-primary">Puente Crossover:</strong> Libros diseñados para transferir lectores de una serie terminada a una nueva, maximizando el valor de vida (LTV) del lector.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

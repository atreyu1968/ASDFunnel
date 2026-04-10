import { useQuery } from "@tanstack/react-query";
import { 
  useGetDashboardSummary, 
  getGetDashboardSummaryQueryKey,
  useGetSeriesProgress,
  getGetSeriesProgressQueryKey,
  useGetRecentActivity,
  getGetRecentActivityQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  
  const { data: seriesProgress, isLoading: isLoadingSeries } = useGetSeriesProgress({
    query: { queryKey: getGetSeriesProgressQueryKey() }
  });

  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Panel de Control</h2>
        <p className="text-muted-foreground">Resumen de la operación editorial.</p>
      </div>

      {isLoadingSummary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Libros Totales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalBooks}</div>
              <p className="text-xs text-muted-foreground">
                {summary.publishedBooks} publicados, {summary.scheduledBooks} programados
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">En Producción</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.inProductionBooks}</div>
              <p className="text-xs text-muted-foreground">
                {summary.draftBooks} en borrador
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Series Activas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalSeries}</div>
              <p className="text-xs text-muted-foreground">
                Con {summary.totalAuthors} autores/pseudónimos
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Próximo Lanzamiento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold truncate">
                {summary.nextRelease ? summary.nextRelease.title : "Ninguno"}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.nextRelease?.publicationDate 
                  ? format(new Date(summary.nextRelease.publicationDate), "PP", { locale: es }) 
                  : "N/A"}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Progreso de Series</CardTitle>
            <CardDescription>Estado actual de las series en desarrollo.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSeries ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : seriesProgress && seriesProgress.length > 0 ? (
              <div className="space-y-6">
                {seriesProgress.map((series) => (
                  <div key={series.seriesId} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-medium">{series.seriesName}</div>
                      <div className="text-muted-foreground">
                        {series.publishedBooks} / {series.totalBooks} libros
                      </div>
                    </div>
                    <Progress value={series.progressPercent} className="h-2" />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{series.authorPenName}</Badge>
                      <span>{series.status === "active" ? "Activa" : series.status === "planned" ? "Planeada" : "Completada"}</span>
                      {series.hasCrossover && (
                        <span className="text-primary truncate">
                          Crossover con {series.crossoverToSeriesName}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No hay series registradas.</div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>Últimas modificaciones en el catálogo.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex flex-col space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{activity.bookTitle}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(activity.timestamp), "d MMM, HH:mm", { locale: es })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {activity.action} en {activity.seriesName}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No hay actividad reciente.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

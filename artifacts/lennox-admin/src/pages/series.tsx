import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListSeries,
  getListSeriesQueryKey,
  useCreateSeries,
  useUpdateSeries,
  useDeleteSeries,
  useListAuthors,
  getListAuthorsQueryKey
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Library, GitMerge, Filter, Brain, Loader2, Copy, Check } from "lucide-react";
import { aiGenerateSeriesSummary } from "@/lib/ai-api";

const seriesSchema = z.object({
  name: z.string().min(1, "El nombre de la serie es requerido"),
  authorId: z.coerce.number().min(1, "Debes seleccionar un autor"),
  language: z.string().min(1, "El idioma es requerido"),
  description: z.string().optional().nullable(),
  genre: z.string().optional().nullable(),
  status: z.enum(["active", "planned", "completed"]).default("planned"),
  displayOrder: z.coerce.number().default(0),
  crossoverFromSeriesId: z.coerce.number().optional().nullable(),
});

const languageLabels: Record<string, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
};

type SeriesFormValues = z.infer<typeof seriesSchema>;

export default function Series() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<number | null>(null);
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams: Record<string, string | undefined> = {};
  if (filterLanguage !== "all") listParams.language = filterLanguage;

  const { data: allSeries, isLoading } = useListSeries(listParams, {
    query: { queryKey: getListSeriesQueryKey(listParams) }
  });

  const seriesList = allSeries?.filter(s => {
    if (filterAuthor !== "all" && s.authorPenName !== filterAuthor) return false;
    return true;
  });

  const { data: authors } = useListAuthors({
    query: { queryKey: getListAuthorsQueryKey() }
  });

  const createSeries = useCreateSeries();
  const updateSeries = useUpdateSeries();
  const deleteSeries = useDeleteSeries();

  const form = useForm<SeriesFormValues>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      name: "",
      authorId: 0,
      language: "es",
      description: "",
      genre: "",
      status: "planned",
      displayOrder: 0,
      crossoverFromSeriesId: null,
    },
  });

  const onSubmit = (data: SeriesFormValues) => {
    if (editingSeriesId) {
      updateSeries.mutate({ id: editingSeriesId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
          toast({ title: "Serie actualizada" });
          setIsCreateOpen(false);
          setEditingSeriesId(null);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al actualizar", variant: "destructive" });
        }
      });
    } else {
      createSeries.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
          toast({ title: "Serie creada" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al crear", variant: "destructive" });
        }
      });
    }
  };

  const handleEdit = (series: any) => {
    setEditingSeriesId(series.id);
    form.reset({
      name: series.name,
      authorId: series.authorId,
      language: series.language || "es",
      description: series.description || "",
      genre: series.genre || "",
      status: series.status,
      displayOrder: series.displayOrder,
      crossoverFromSeriesId: series.crossoverFromSeriesId || null,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteSeries.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
        toast({ title: "Serie eliminada" });
      },
      onError: () => {
        toast({ title: "Error al eliminar", variant: "destructive" });
      }
    });
  };

  const handleAiSummary = async (seriesId: number) => {
    setAiSummaryLoading(seriesId);
    try {
      const result = await aiGenerateSeriesSummary(seriesId);
      setAiSummary({ seriesId, ...result });
      toast({ title: "Resumen de serie generado con IA" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAiSummaryLoading(null);
    }
  };

  const handleCopyField = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleApplySummary = async (seriesId: number, description: string) => {
    updateSeries.mutate({ id: seriesId, data: { description } as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSeriesQueryKey() });
        toast({ title: "Descripción de serie actualizada" });
        setAiSummary(null);
      },
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-primary text-primary-foreground hover:bg-primary/90">Activa</Badge>;
      case "planned": return <Badge variant="outline">Planeada</Badge>;
      case "completed": return <Badge variant="secondary">Completada</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Series</h2>
          <p className="text-muted-foreground">Gestión de series literarias y conexiones (crossovers).</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setEditingSeriesId(null);
            form.reset({
              name: "",
              authorId: 0,
              language: "es",
              description: "",
              genre: "",
              status: "planned",
              displayOrder: 0,
              crossoverFromSeriesId: null,
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Serie</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{editingSeriesId ? "Editar Serie" : "Crear Serie"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la Serie *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Los Asesinatos de Seattle" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="authorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Autor *</FormLabel>
                        <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? field.value.toString() : undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar autor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {authors?.map(author => (
                              <SelectItem key={author.id} value={author.id.toString()}>
                                {author.penName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar estado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Activa</SelectItem>
                            <SelectItem value="planned">Planeada</SelectItem>
                            <SelectItem value="completed">Completada</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Idioma *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar idioma" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(languageLabels).map(([code, label]) => (
                            <SelectItem key={code} value={code}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="genre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Género</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej. Procedimental Policial" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="crossoverFromSeriesId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Crossover Desde (Spinoff)</FormLabel>
                        <Select onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))} value={field.value ? field.value.toString() : "none"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Ninguna" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Ninguna</SelectItem>
                            {seriesList?.filter(s => s.id !== editingSeriesId).map(series => (
                              <SelectItem key={series.id} value={series.id.toString()}>
                                {series.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Trama general de la serie" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createSeries.isPending || updateSeries.isPending}>
                    {editingSeriesId ? "Guardar Cambios" : "Crear Serie"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
        <Select value={filterAuthor} onValueChange={setFilterAuthor}>
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
        {(filterLanguage !== "all" || filterAuthor !== "all") && (
          <button
            onClick={() => { setFilterLanguage("all"); setFilterAuthor("all"); }}
            className="text-xs text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : seriesList && seriesList.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {seriesList.map((series) => (
            <Card key={series.id} className="overflow-hidden">
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Library className="h-5 w-5 text-primary" />
                      {series.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{series.authorPenName}</span>
                      <span>•</span>
                      <span>{series.bookCount} libros</span>
                    </div>
                    <Badge variant="outline" className="uppercase text-xs w-fit">
                      {languageLabels[(series as any).language] || (series as any).language || "—"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(series.status)}
                    <Button variant="ghost" size="icon" onClick={() => handleAiSummary(series.id)} title="Generar resumen IA" disabled={aiSummaryLoading === series.id}>
                      {aiSummaryLoading === series.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(series)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar serie?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Asegúrate de no tener libros asociados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDelete(series.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  {series.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {series.description}
                    </p>
                  )}
                  {series.crossoverFromSeriesName && (
                    <div className="flex items-center gap-2 text-xs font-medium text-amber-500 bg-amber-500/10 p-2 rounded-md">
                      <GitMerge className="h-4 w-4" />
                      Spinoff de: {series.crossoverFromSeriesName}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <p className="text-muted-foreground">No hay series registradas.</p>
        </div>
      )}

      <Dialog open={!!aiSummary} onOpenChange={() => setAiSummary(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Resumen de Serie (IA)</DialogTitle>
          </DialogHeader>
          {aiSummary && (
            <div className="space-y-4">
              {[
                { label: "Descripción", key: "description", value: aiSummary.description },
                { label: "Tagline", key: "tagline", value: aiSummary.tagline },
                { label: "Orden de lectura", key: "readingOrder", value: aiSummary.readingOrder },
                { label: "Gancho para audiencia", key: "audienceHook", value: aiSummary.audienceHook },
              ].map((item) => item.value && (
                <div key={item.key} className="p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase">{item.label}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleCopyField(item.value, item.key)}>
                      {copiedField === item.key ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <p className="text-sm">{item.value}</p>
                </div>
              ))}
              <Button className="w-full" onClick={() => handleApplySummary(aiSummary.seriesId, aiSummary.description)}>
                Aplicar descripción a la serie
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

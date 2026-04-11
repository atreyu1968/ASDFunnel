import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useListBooks,
  getListBooksQueryKey,
  useCreateBook,
  useUpdateBook,
  useDeleteBook,
  useListSeries,
  getListSeriesQueryKey,
  useListAuthors,
  getListAuthorsQueryKey,
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
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
import { Plus, Edit2, Trash2, Filter, ImagePlus, FileText, Loader2, Upload, Brain, BookOpen, Copy, Check, ExternalLink, SpellCheck } from "lucide-react";
import { aiGenerateKdp, aiProofread } from "@/lib/ai-api";
import { DialogDescription } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const bookSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  seriesId: z.coerce.number().min(1, "Debes seleccionar una serie"),
  bookNumber: z.coerce.number().min(0, "El número debe ser 0 o mayor"),
  subtitle: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  wordCount: z.coerce.number().optional().nullable(),
  funnelRole: z.enum(["lead_magnet", "traffic_entry", "core_offer", "crossover_bridge"]),
  pricingStrategy: z.enum(["perma_free", "promotional", "full_price"]),
  price: z.coerce.number().optional().nullable(),
  promotionalPrice: z.coerce.number().optional().nullable(),
  status: z.enum(["draft", "production", "ready", "scheduled", "published"]),
  publicationDate: z.string().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  distributionChannel: z.enum(["wide", "email_exclusive", "kdp"]).optional().nullable(),
  asin: z.string().optional().nullable(),
  isbn: z.string().optional().nullable(),
  books2readUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
  crossoverToSeriesId: z.coerce.number().optional().nullable(),
});

type BookFormValues = z.infer<typeof bookSchema>;

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function uploadFileToStorage(file: File): Promise<{ objectPath: string }> {
  const res = await fetch(`${API_BASE}api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!res.ok) throw new Error("No se pudo solicitar la URL de subida");
  const { uploadURL, objectPath } = await res.json();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("No se pudo subir el archivo");
  return { objectPath };
}

export default function Books() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  const [uploadingCover, setUploadingCover] = useState<number | null>(null);
  const [uploadingManuscript, setUploadingManuscript] = useState<number | null>(null);
  const [kdpLoading, setKdpLoading] = useState<number | null>(null);
  const [kdpResult, setKdpResult] = useState<any>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [proofreadOpen, setProofreadOpen] = useState(false);
  const [proofreadBookId, setProofreadBookId] = useState<number | null>(null);
  const [proofreadText, setProofreadText] = useState("");
  const [proofreadLoading, setProofreadLoading] = useState(false);
  const [proofreadResult, setProofreadResult] = useState<{
    correctedText: string;
    changes: string[];
    blocksProcessed: number;
    originalLength: number;
    correctedLength: number;
    glitches?: { block: number; type: string; description: string; original: string; fixed: string }[];
    stats?: { totalGlitches: number; criticalGlitches: number; typographicFixes: number };
  } | null>(null);
  const [proofreadMode, setProofreadMode] = useState<"manuscript" | "text">("manuscript");
  
  const [filterSeries, setFilterSeries] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<string | "all">("all");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [filterAuthor, setFilterAuthor] = useState<string>("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams: Record<string, any> = {};
  if (filterSeries !== "all") queryParams.seriesId = filterSeries;
  if (filterStatus !== "all") queryParams.status = filterStatus;
  if (filterLanguage !== "all") queryParams.language = filterLanguage;

  const { data: allBooks, isLoading } = useListBooks(queryParams, {
    query: { queryKey: getListBooksQueryKey(queryParams) }
  });

  const books = allBooks?.filter(b => {
    if (filterAuthor !== "all" && b.authorPenName !== filterAuthor) return false;
    return true;
  });

  const { data: seriesList } = useListSeries(undefined, {
    query: { queryKey: getListSeriesQueryKey() }
  });

  const { data: authors } = useListAuthors({
    query: { queryKey: getListAuthorsQueryKey() }
  });

  const filteredSeriesList = filterAuthor === "all"
    ? seriesList
    : seriesList?.filter(s => s.authorPenName === filterAuthor);

  const createBook = useCreateBook();
  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();

  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      title: "",
      seriesId: 0,
      bookNumber: 1,
      subtitle: "",
      description: "",
      wordCount: null,
      funnelRole: "core_offer",
      pricingStrategy: "full_price",
      price: null,
      promotionalPrice: null,
      status: "draft",
      publicationDate: "",
      scheduledDate: "",
      distributionChannel: "wide",
      asin: "",
      isbn: "",
      books2readUrl: "",
      crossoverToSeriesId: null,
    },
  });

  const onSubmit = (data: BookFormValues) => {
    if (editingBookId) {
      updateBook.mutate({ id: editingBookId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
          toast({ title: "Libro actualizado" });
          setIsCreateOpen(false);
          setEditingBookId(null);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al actualizar", variant: "destructive" });
        }
      });
    } else {
      createBook.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
          toast({ title: "Libro creado" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al crear", variant: "destructive" });
        }
      });
    }
  };

  const handleEdit = (book: any) => {
    setEditingBookId(book.id);
    form.reset({
      title: book.title,
      seriesId: book.seriesId,
      bookNumber: book.bookNumber,
      subtitle: book.subtitle || "",
      description: book.description || "",
      wordCount: book.wordCount,
      funnelRole: book.funnelRole,
      pricingStrategy: book.pricingStrategy,
      price: book.price,
      promotionalPrice: book.promotionalPrice,
      status: book.status,
      publicationDate: book.publicationDate ? book.publicationDate.split('T')[0] : "",
      scheduledDate: book.scheduledDate ? book.scheduledDate.split('T')[0] : "",
      distributionChannel: book.distributionChannel || "wide",
      asin: book.asin || "",
      isbn: book.isbn || "",
      books2readUrl: book.books2readUrl || "",
      crossoverToSeriesId: book.crossoverToSeriesId || null,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteBook.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
        toast({ title: "Libro eliminado" });
      },
      onError: () => {
        toast({ title: "Error al eliminar", variant: "destructive" });
      }
    });
  };

  const handleCoverUpload = async (bookId: number, file: File) => {
    setUploadingCover(bookId);
    try {
      const { objectPath } = await uploadFileToStorage(file);
      await updateBook.mutateAsync({
        id: bookId,
        data: { coverImageUrl: `${API_BASE}api/storage${objectPath}` } as any,
      });
      queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
      toast({ title: "Portada actualizada" });
    } catch {
      toast({ title: "Error al subir la portada", variant: "destructive" });
    } finally {
      setUploadingCover(null);
    }
  };

  const handleManuscriptUpload = async (bookId: number, file: File) => {
    setUploadingManuscript(bookId);
    try {
      const { objectPath } = await uploadFileToStorage(file);
      const res = await fetch(`${API_BASE}api/books/${bookId}/upload-manuscript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manuscriptObjectPath: objectPath, generateLandingPage: true }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
      if (result.landingPageId) {
        toast({
          title: "Landing page generada con IA",
          description: `"${result.title}" - ${result.hook}`,
        });
      } else {
        toast({ title: "Manuscrito guardado" });
      }
    } catch (e: any) {
      toast({ title: "Error al procesar manuscrito", description: e.message, variant: "destructive" });
    } finally {
      setUploadingManuscript(null);
    }
  };

  const handleKdpGenerate = async (bookId: number) => {
    setKdpLoading(bookId);
    try {
      const result = await aiGenerateKdp(bookId);
      setKdpResult(result);
      toast({ title: "Contenido editorial generado con IA" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setKdpLoading(null);
    }
  };

  const handleCopyKdp = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleProofreadOpen = (bookId: number) => {
    setProofreadBookId(bookId);
    setProofreadText("");
    setProofreadResult(null);
    setProofreadMode("manuscript");
    setProofreadOpen(true);
  };

  const handleProofreadSubmit = async () => {
    setProofreadLoading(true);
    try {
      const params: { bookId?: number; text?: string } = {};
      if (proofreadMode === "manuscript" && proofreadBookId) {
        params.bookId = proofreadBookId;
      } else if (proofreadMode === "text" && proofreadText.trim()) {
        params.text = proofreadText;
        if (proofreadBookId) params.bookId = proofreadBookId;
      } else {
        toast({ title: "Error", description: "Selecciona un manuscrito o pega el texto a corregir", variant: "destructive" });
        setProofreadLoading(false);
        return;
      }
      const result = await aiProofread(params);
      setProofreadResult(result);
      toast({ title: `Corrección completada (${result.blocksProcessed} bloques procesados)` });
    } catch (e: any) {
      toast({ title: "Error al corregir", description: e.message, variant: "destructive" });
    } finally {
      setProofreadLoading(false);
    }
  };

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

  const getFunnelBadge = (role: string) => {
    switch (role) {
      case "lead_magnet": return <Badge variant="secondary">Lead Magnet</Badge>;
      case "traffic_entry": return <Badge variant="secondary">Entrada</Badge>;
      case "core_offer": return <Badge variant="outline">Principal</Badge>;
      case "crossover_bridge": return <Badge className="border-primary text-primary" variant="outline">Puente</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Libros</h2>
          <p className="text-muted-foreground">Catálogo de títulos y configuración del embudo.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setEditingBookId(null);
            form.reset({
              title: "",
              seriesId: 0,
              bookNumber: 1,
              subtitle: "",
              description: "",
              wordCount: null,
              funnelRole: "core_offer",
              pricingStrategy: "full_price",
              price: null,
              promotionalPrice: null,
              status: "draft",
              publicationDate: "",
              scheduledDate: "",
              distributionChannel: "wide",
              asin: "",
              isbn: "",
              books2readUrl: "",
              crossoverToSeriesId: null,
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Libro</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingBookId ? "Editar Libro" : "Crear Libro"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-6 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="col-span-4">
                        <FormLabel>Título *</FormLabel>
                        <FormControl>
                          <Input placeholder="Título del libro" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bookNumber"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Número (#)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={field.value || 0} onChange={e => field.onChange(Number(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="seriesId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Serie *</FormLabel>
                        <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? field.value.toString() : undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar serie" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {seriesList?.map(series => (
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
                            <SelectItem value="draft">Borrador</SelectItem>
                            <SelectItem value="production">En Producción</SelectItem>
                            <SelectItem value="ready">Listo</SelectItem>
                            <SelectItem value="scheduled">Programado</SelectItem>
                            <SelectItem value="published">Publicado</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 bg-muted/50 p-4 rounded-lg border">
                  <FormField
                    control={form.control}
                    name="funnelRole"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rol en Embudo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Rol" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="lead_magnet">Lead Magnet</SelectItem>
                            <SelectItem value="traffic_entry">Entrada de Tráfico</SelectItem>
                            <SelectItem value="core_offer">Oferta Principal</SelectItem>
                            <SelectItem value="crossover_bridge">Puente Crossover</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pricingStrategy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estrategia Precio</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Estrategia" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="perma_free">Perma-Free</SelectItem>
                            <SelectItem value="promotional">Promocional</SelectItem>
                            <SelectItem value="full_price">Precio Completo</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="scheduledDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha Programada</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="publicationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha Publicación</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="books2readUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enlace Books2Read (Universal Book Link)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://books2read.com/u/..." {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createBook.isPending || updateBook.isPending}>
                    {editingBookId ? "Guardar Cambios" : "Crear Libro"}
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
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
            <SelectItem value="it">Italiano</SelectItem>
            <SelectItem value="pt">Português</SelectItem>
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
        <Select value={filterSeries.toString()} onValueChange={(v) => setFilterSeries(v === "all" ? "all" : Number(v))}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Serie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las series</SelectItem>
            {filteredSeriesList?.map(s => (
              <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="production">En Producción</SelectItem>
            <SelectItem value="ready">Listo</SelectItem>
            <SelectItem value="scheduled">Programado</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
          </SelectContent>
        </Select>
        {(filterLanguage !== "all" || filterAuthor !== "all" || filterSeries !== "all" || filterStatus !== "all") && (
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
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : books && books.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 w-16"></th>
                  <th className="px-4 py-3">Libro</th>
                  <th className="px-4 py-3">Serie / Autor</th>
                  <th className="px-4 py-3">Rol Embudo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b-0">
                {books.map((book) => (
                  <tr key={book.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 w-16">
                      <div className="relative group w-12 h-16 bg-muted/40 rounded overflow-hidden border flex items-center justify-center">
                        {book.coverImageUrl ? (
                          <img 
                            src={book.coverImageUrl} 
                            alt={book.title} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <ImagePlus className="h-4 w-4 text-muted-foreground" />
                        )}
                        <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                          {uploadingCover === book.id ? (
                            <Loader2 className="h-4 w-4 text-white animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 text-white" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleCoverUpload(book.id, f);
                              e.target.value = "";
                            }}
                            disabled={uploadingCover === book.id}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">
                        #{book.bookNumber} {book.title}
                      </div>
                      {book.scheduledDate && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(new Date(book.scheduledDate), "d MMM yyyy", { locale: es })}
                        </div>
                      )}
                      {book.manuscriptPath && (
                        <div className="text-xs text-green-500 mt-0.5 flex items-center gap-1">
                          <FileText className="h-3 w-3" /> Manuscrito
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-foreground">{book.seriesName}</div>
                      <div className="text-xs text-muted-foreground">{book.authorPenName}</div>
                    </td>
                    <td className="px-4 py-4">
                      {getFunnelBadge(book.funnelRole)}
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(book.status)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <label className="inline-flex">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-muted-foreground hover:text-primary" 
                            asChild
                            disabled={uploadingManuscript === book.id}
                          >
                            <span>
                              {uploadingManuscript === book.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Brain className="h-4 w-4" />
                              )}
                            </span>
                          </Button>
                          <input
                            type="file"
                            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleManuscriptUpload(book.id, f);
                              e.target.value = "";
                            }}
                            disabled={uploadingManuscript === book.id}
                          />
                        </label>
                        <Button variant="ghost" size="icon" onClick={() => handleKdpGenerate(book.id)} title="Generar ficha editorial (D2D)" disabled={kdpLoading === book.id} className="text-muted-foreground hover:text-primary">
                          {kdpLoading === book.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleProofreadOpen(book.id)} title="Corrección ortotipográfica (IA)" className="text-muted-foreground hover:text-primary">
                          <SpellCheck className="h-4 w-4" />
                        </Button>
                        {book.books2readUrl && (
                          <a href={book.books2readUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="icon" title="Ver en Books2Read" className="text-muted-foreground hover:text-primary">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(book)}>
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
                              <AlertDialogTitle>¿Eliminar libro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará el libro del catálogo.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDelete(book.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <p className="text-muted-foreground">No hay libros que coincidan con los filtros.</p>
        </div>
      )}

      <Dialog open={proofreadOpen} onOpenChange={(open) => {
        setProofreadOpen(open);
        if (!open) { setProofreadResult(null); setProofreadText(""); }
      }}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SpellCheck className="h-5 w-5 text-primary" /> Corrector Ortotipográfico Senior
            </DialogTitle>
            <DialogDescription>
              Corrección profesional con detección de glitches de IA, errores ortotipográficos y preservación del estilo narrativo.
            </DialogDescription>
          </DialogHeader>

          {!proofreadResult ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={proofreadMode === "manuscript" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setProofreadMode("manuscript")}
                >
                  <FileText className="h-4 w-4 mr-1" /> Manuscrito subido
                </Button>
                <Button
                  variant={proofreadMode === "text" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setProofreadMode("text")}
                >
                  <Edit2 className="h-4 w-4 mr-1" /> Pegar texto
                </Button>
              </div>

              {proofreadMode === "manuscript" ? (
                <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Se usará el manuscrito (.docx) subido para este libro. El texto se extraerá automáticamente y se procesará bloque a bloque.
                  </p>
                  {proofreadBookId && books?.find(b => b.id === proofreadBookId) && (
                    <div className="text-sm">
                      <span className="font-medium">Libro: </span>
                      {books.find(b => b.id === proofreadBookId)?.title}
                      {!books.find(b => b.id === proofreadBookId)?.manuscriptPath && (
                        <p className="text-amber-500 mt-1">Este libro no tiene manuscrito subido. Sube un .docx primero o usa la opción "Pegar texto".</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <Textarea
                  placeholder="Pega aquí el texto a corregir (capítulo, fragmento, etc.)..."
                  value={proofreadText}
                  onChange={(e) => setProofreadText(e.target.value)}
                  className="min-h-[200px] font-mono text-xs"
                />
              )}

              <div className="p-3 rounded-lg border bg-muted/20 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">El corrector detectará:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Párrafos o frases clonadas (glitches de IA)</li>
                  <li>Diálogos rotos o solapados</li>
                  <li>Bucles de acción repetidos</li>
                  <li>Errores de concordancia, tiempos verbales, acentuación</li>
                  <li>Formato incorrecto de diálogos literarios</li>
                </ul>
                <p className="mt-1 text-amber-500">Regla de oro: preserva el estilo, tono y trama del autor.</p>
              </div>

              <Button
                onClick={handleProofreadSubmit}
                disabled={proofreadLoading || (proofreadMode === "text" && proofreadText.trim().length < 50)}
                className="w-full"
              >
                {proofreadLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Corrigiendo texto (puede tardar)...</>
                ) : (
                  <><SpellCheck className="h-4 w-4 mr-2" /> Iniciar corrección</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                <span>{proofreadResult.blocksProcessed} bloques procesados</span>
                <span>{proofreadResult.originalLength.toLocaleString()} → {proofreadResult.correctedLength.toLocaleString()} caracteres</span>
                {proofreadResult.stats && (
                  <>
                    <span className={proofreadResult.stats.criticalGlitches > 0 ? "text-red-400 font-medium" : "text-green-400"}>
                      {proofreadResult.stats.criticalGlitches} glitches críticos
                    </span>
                    <span>{proofreadResult.stats.typographicFixes} correcciones tipográficas</span>
                  </>
                )}
              </div>

              {proofreadResult.glitches && proofreadResult.glitches.length > 0 && (
                <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                  <span className="text-xs font-medium text-red-400 uppercase">Glitches de IA detectados ({proofreadResult.glitches.length})</span>
                  <div className="mt-2 space-y-3 max-h-[200px] overflow-y-auto">
                    {proofreadResult.glitches.map((g, i) => (
                      <div key={i} className="text-xs border-l-2 border-red-500/50 pl-3 space-y-1">
                        <div className="flex gap-2 items-center">
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            {g.type.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-muted-foreground">Bloque {g.block}</span>
                        </div>
                        <p className="text-muted-foreground">{g.description}</p>
                        {g.original && (
                          <div className="bg-red-500/5 p-1.5 rounded text-red-300 line-through">
                            {g.original}
                          </div>
                        )}
                        {g.fixed && (
                          <div className="bg-green-500/5 p-1.5 rounded text-green-300">
                            {g.fixed}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {proofreadResult.changes.length > 0 && (
                <div className="p-3 rounded-lg border bg-amber-500/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-amber-500 uppercase">Detalle de cambios ({proofreadResult.changes.length})</span>
                  </div>
                  <ul className="text-xs space-y-1 max-h-[150px] overflow-y-auto">
                    {proofreadResult.changes.map((change, i) => (
                      <li key={i} className="text-muted-foreground">• {change}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Texto corregido</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(proofreadResult.correctedText);
                      setCopiedField("proofread");
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                  >
                    {copiedField === "proofread" ? <><Check className="h-3 w-3 mr-1 text-green-500" /> Copiado</> : <><Copy className="h-3 w-3 mr-1" /> Copiar todo</>}
                  </Button>
                </div>
                <div className="text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto font-serif leading-relaxed">
                  {proofreadResult.correctedText}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setProofreadResult(null); setProofreadText(""); }} className="flex-1">
                  Nueva corrección
                </Button>
                <Button variant="outline" onClick={() => setProofreadOpen(false)} className="flex-1">
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!kdpResult} onOpenChange={() => { setKdpResult(null); setCopiedField(null); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Ficha Editorial (IA)</DialogTitle>
          </DialogHeader>
          {kdpResult && (
            <div className="space-y-4">
              {[
                { label: "Descripción Tiendas", key: "amazonDescription", value: kdpResult.amazonDescription },
                { label: "Contraportada", key: "backCover", value: kdpResult.backCover },
                { label: "Tagline", key: "tagline", value: kdpResult.tagline },
                { label: "Autores comparables", key: "comparableAuthors", value: kdpResult.comparableAuthors },
              ].map((item) => item.value && (
                <div key={item.key} className="p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase">{item.label}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleCopyKdp(typeof item.value === 'string' ? item.value : JSON.stringify(item.value), item.key)}>
                      {copiedField === item.key ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{item.value}</p>
                </div>
              ))}
              {kdpResult.keywords && (
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Keywords</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleCopyKdp(kdpResult.keywords.join(", "), "keywords")}>
                      {copiedField === "keywords" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {kdpResult.keywords.map((kw: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {kdpResult.categories && (
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Categorías BISAC</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {kdpResult.categories.map((cat: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{cat}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

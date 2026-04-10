import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useListLandingPages,
  getListLandingPagesQueryKey,
  useCreateLandingPage,
  useUpdateLandingPage,
  useDeleteLandingPage,
  useListAuthors,
  getListAuthorsQueryKey,
  useListSeries,
  getListSeriesQueryKey,
  useListBooks,
  getListBooksQueryKey,
  useListMailingLists,
  getListMailingListsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Globe, ExternalLink, FileText } from "lucide-react";
import type { LandingPage } from "@workspace/api-client-react";

const landingPageSchema = z.object({
  entityType: z.enum(["author", "series", "book"]),
  entityId: z.coerce.number().min(1, "La entidad es requerida"),
  language: z.string().min(1, "El idioma es requerido"),
  url: z.string().min(1, "La URL es requerida"),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  metaTitle: z.string().optional().nullable(),
  metaDescription: z.string().optional().nullable(),
  captureHeading: z.string().optional().nullable(),
  captureSubheading: z.string().optional().nullable(),
  captureButtonText: z.string().optional().nullable(),
  mailingListId: z.coerce.number().optional().nullable(),
  isPublished: z.boolean().optional(),
});

type LandingPageFormValues = z.infer<typeof landingPageSchema>;

export default function LandingPages() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterEntityType, setFilterEntityType] = useState<string>("all");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams: Record<string, string | undefined> = {};
  if (filterEntityType !== "all") listParams.entityType = filterEntityType;
  if (filterLanguage !== "all") listParams.language = filterLanguage;

  const { data: landingPages, isLoading } = useListLandingPages(
    listParams,
    { query: { queryKey: getListLandingPagesQueryKey(listParams) } }
  );

  const { data: authors } = useListAuthors({ query: { queryKey: getListAuthorsQueryKey() } });
  const { data: series } = useListSeries(undefined, { query: { queryKey: getListSeriesQueryKey() } });
  const { data: books } = useListBooks(undefined, { query: { queryKey: getListBooksQueryKey() } });
  const { data: mailingLists } = useListMailingLists(undefined, { query: { queryKey: getListMailingListsQueryKey() } });

  const createLandingPage = useCreateLandingPage();
  const updateLandingPage = useUpdateLandingPage();
  const deleteLandingPage = useDeleteLandingPage();

  const form = useForm<LandingPageFormValues>({
    resolver: zodResolver(landingPageSchema),
    defaultValues: {
      entityType: "author",
      entityId: 0,
      language: "es",
      url: "",
      title: "",
      description: "",
      metaTitle: "",
      metaDescription: "",
      captureHeading: "",
      captureSubheading: "",
      captureButtonText: "",
      mailingListId: null,
      isPublished: false,
    },
  });

  const watchedEntityType = form.watch("entityType");

  const entityOptions = () => {
    if (watchedEntityType === "author") return authors?.map(a => ({ id: a.id, label: a.penName })) ?? [];
    if (watchedEntityType === "series") return series?.map(s => ({ id: s.id, label: s.name })) ?? [];
    if (watchedEntityType === "book") return books?.map(b => ({ id: b.id, label: b.title })) ?? [];
    return [];
  };

  const onSubmit = (data: LandingPageFormValues) => {
    const payload = {
      ...data,
      mailingListId: data.mailingListId || undefined,
    };

    if (editingId) {
      const { entityType: _et, entityId: _eid, ...updateData } = payload;
      updateLandingPage.mutate({ id: editingId, data: updateData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLandingPagesQueryKey() });
          toast({ title: "Landing page actualizada" });
          setIsCreateOpen(false);
          setEditingId(null);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al actualizar", variant: "destructive" });
        }
      });
    } else {
      createLandingPage.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLandingPagesQueryKey() });
          toast({ title: "Landing page creada" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al crear", variant: "destructive" });
        }
      });
    }
  };

  const handleEdit = (page: LandingPage) => {
    setEditingId(page.id);
    form.reset({
      entityType: page.entityType as "author" | "series" | "book",
      entityId: page.entityId,
      language: page.language,
      url: page.url,
      title: page.title || "",
      description: page.description || "",
      metaTitle: page.metaTitle || "",
      metaDescription: page.metaDescription || "",
      captureHeading: page.captureHeading || "",
      captureSubheading: page.captureSubheading || "",
      captureButtonText: page.captureButtonText || "",
      mailingListId: page.mailingListId,
      isPublished: page.isPublished,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteLandingPage.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLandingPagesQueryKey() });
        toast({ title: "Landing page eliminada" });
      },
      onError: () => {
        toast({ title: "Error al eliminar", variant: "destructive" });
      }
    });
  };

  const entityTypeLabels: Record<string, string> = {
    author: "Autor",
    series: "Serie",
    book: "Libro",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Landing Pages</h2>
          <p className="text-muted-foreground">Páginas de captación multi-idioma por autor, serie o libro.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setEditingId(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Landing Page</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Landing Page" : "Crear Landing Page"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="entityType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Entidad *</FormLabel>
                        <Select onValueChange={(v) => { field.onChange(v); form.setValue("entityId", 0); }} value={field.value} disabled={!!editingId}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="author">Autor</SelectItem>
                            <SelectItem value="series">Serie</SelectItem>
                            <SelectItem value="book">Libro</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="entityId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entidad *</FormLabel>
                        <Select onValueChange={field.onChange} value={String(field.value || "")} disabled={!!editingId}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {entityOptions().map(e => (
                              <SelectItem key={e.id} value={String(e.id)}>{e.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Idioma *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="es">Español</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="fr">Français</SelectItem>
                            <SelectItem value="de">Deutsch</SelectItem>
                            <SelectItem value="it">Italiano</SelectItem>
                            <SelectItem value="pt">Português</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL *</FormLabel>
                      <FormControl>
                        <Input placeholder="https://tudominio.com/es/nombre-autor" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Título</FormLabel>
                        <FormControl>
                          <Input placeholder="Título de la landing" {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="metaTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meta Title (SEO)</FormLabel>
                        <FormControl>
                          <Input placeholder="Meta título para SEO" {...field} value={field.value || ""} />
                        </FormControl>
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
                        <Textarea placeholder="Descripción de la landing" {...field} value={field.value || ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="metaDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meta Description (SEO)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Meta descripción para motores de búsqueda" {...field} value={field.value || ""} rows={2} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Sección de Captación</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="captureHeading"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Encabezado</FormLabel>
                          <FormControl>
                            <Input placeholder="Descarga gratis..." {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="captureButtonText"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Texto del Botón</FormLabel>
                          <FormControl>
                            <Input placeholder="Obtener mi copia" {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="captureSubheading"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Subtítulo</FormLabel>
                        <FormControl>
                          <Input placeholder="Suscríbete y recibe..." {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="mailingListId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lista de Correo Asociada</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))} value={field.value ? String(field.value) : "none"}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Sin lista" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin lista asociada</SelectItem>
                          {mailingLists?.map(ml => (
                            <SelectItem key={ml.id} value={String(ml.id)}>{ml.name} ({ml.language.toUpperCase()})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isPublished"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormLabel>Publicada</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createLandingPage.isPending || updateLandingPage.isPending}>
                    {editingId ? "Guardar Cambios" : "Crear Landing Page"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <Select value={filterEntityType} onValueChange={setFilterEntityType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="author">Autor</SelectItem>
            <SelectItem value="series">Serie</SelectItem>
            <SelectItem value="book">Libro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterLanguage} onValueChange={setFilterLanguage}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todos los idiomas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los idiomas</SelectItem>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
            <SelectItem value="pt">Português</SelectItem>
            <SelectItem value="it">Italiano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Landing Pages</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{landingPages?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Publicadas</CardTitle>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{landingPages?.filter(p => p.isPublished).length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Borradores</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{landingPages?.filter(p => !p.isPublished).length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : landingPages && landingPages.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {landingPages.map((page) => (
            <Card key={page.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="h-4 w-4 shrink-0" />
                      <span className="truncate">{page.title || page.url}</span>
                    </CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant={page.isPublished ? "default" : "secondary"}>
                        {page.isPublished ? "Publicada" : "Borrador"}
                      </Badge>
                      <Badge variant="outline">{entityTypeLabels[page.entityType] || page.entityType}</Badge>
                      <Badge variant="outline" className="uppercase">{page.language}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(page)}>
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
                          <AlertDialogTitle>¿Eliminar landing page?</AlertDialogTitle>
                          <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(page.id)} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Entidad:</span>
                  <span className="font-medium truncate ml-2">{page.entityName}</span>
                </div>
                {page.mailingListName && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Lista:</span>
                    <span className="font-medium truncate ml-2">{page.mailingListName}</span>
                  </div>
                )}
                <div className="text-xs truncate">
                  <a href={page.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{page.url}</a>
                </div>
                {page.description && (
                  <p className="text-xs text-muted-foreground bg-muted p-2 rounded-md line-clamp-2">{page.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Creada: {format(new Date(page.createdAt), "d MMM yyyy", { locale: es })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <Globe className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No hay landing pages registradas.</p>
        </div>
      )}
    </div>
  );
}

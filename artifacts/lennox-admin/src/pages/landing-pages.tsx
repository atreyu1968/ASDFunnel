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
import { Plus, Edit2, Trash2, Globe, ExternalLink, FileText, Eye, X, Languages, Loader2, SpellCheck } from "lucide-react";
import type { LandingPage } from "@workspace/api-client-react";
import { aiTranslate } from "@/lib/ai-api";
import { ProofreadDialog } from "@/components/proofread-dialog";

const languageLabels: Record<string, string> = {
  es: "Español", en: "English", fr: "Français", de: "Deutsch", pt: "Português", it: "Italiano",
};

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
  const [previewPage, setPreviewPage] = useState<LandingPage | null>(null);
  const [translating, setTranslating] = useState(false);
  const [proofreadOpen, setProofreadOpen] = useState(false);
  const [proofreadInitialText, setProofreadInitialText] = useState("");

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
  const watchedEntityId = form.watch("entityId");
  const watchedLanguage = form.watch("language");

  const entityOptions = () => {
    if (watchedEntityType === "author") return authors?.map(a => ({ id: a.id, label: a.penName })) ?? [];
    if (watchedEntityType === "series") return series?.map(s => ({ id: s.id, label: s.name })) ?? [];
    if (watchedEntityType === "book") return books?.map(b => ({ id: b.id, label: b.title })) ?? [];
    return [];
  };

  const slugify = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const getAuthorDomain = (entityType: string, entityId: number): string | null => {
    if (!authors?.length) return null;
    if (entityType === "author") {
      const author = authors.find(a => a.id === entityId);
      return (author as any)?.domain || null;
    }
    if (entityType === "series") {
      const s = series?.find(s => s.id === entityId);
      if (!s) return null;
      const author = authors.find(a => a.id === (s as any).authorId);
      return (author as any)?.domain || null;
    }
    if (entityType === "book") {
      const b = books?.find(b => b.id === entityId);
      if (!b) return null;
      const s = series?.find(s => s.id === (b as any).seriesId);
      if (!s) return null;
      const author = authors.find(a => a.id === (s as any).authorId);
      return (author as any)?.domain || null;
    }
    return null;
  };

  const generateUrl = () => {
    const etype = form.getValues("entityType");
    const eid = Number(form.getValues("entityId"));
    const lang = form.getValues("language");
    if (!eid || !lang) return;

    const domain = getAuthorDomain(etype, eid);
    let entitySlug = "";
    if (etype === "author") {
      const a = authors?.find(a => a.id === eid);
      entitySlug = a ? slugify(a.penName) : "";
    } else if (etype === "series") {
      const s = series?.find(s => s.id === eid);
      entitySlug = s ? slugify(s.name) : "";
    } else if (etype === "book") {
      const b = books?.find(b => b.id === eid);
      entitySlug = b ? slugify(b.title) : "";
    }

    if (domain) {
      form.setValue("url", `https://${domain}/${lang}/${entitySlug}`);
    } else {
      form.setValue("url", `/${lang}/${entitySlug}`);
    }
  };

  const getEntityName = (page: LandingPage) => {
    if (page.entityType === "author") return authors?.find(a => a.id === page.entityId)?.penName || "";
    if (page.entityType === "series") return series?.find(s => s.id === page.entityId)?.name || "";
    if (page.entityType === "book") return books?.find(b => b.id === page.entityId)?.title || "";
    return "";
  };

  const getParentLandingPage = (page: LandingPage): LandingPage | null => {
    if (!landingPages) return null;
    if (page.entityType === "book") {
      const b = books?.find(b => b.id === page.entityId);
      if (!b) return null;
      return landingPages.find(lp => lp.entityType === "series" && lp.entityId === (b as any).seriesId && lp.language === page.language) || null;
    }
    if (page.entityType === "series") {
      const s = series?.find(s => s.id === page.entityId);
      if (!s) return null;
      return landingPages.find(lp => lp.entityType === "author" && lp.entityId === (s as any).authorId && lp.language === page.language) || null;
    }
    return null;
  };

  const getChildLandingPages = (page: LandingPage): LandingPage[] => {
    if (!landingPages) return [];
    if (page.entityType === "author") {
      const authorSeries = series?.filter(s => (s as any).authorId === page.entityId) || [];
      return landingPages.filter(lp => lp.entityType === "series" && authorSeries.some(s => s.id === lp.entityId) && lp.language === page.language);
    }
    if (page.entityType === "series") {
      const seriesBooks = books?.filter(b => (b as any).seriesId === page.entityId) || [];
      return landingPages.filter(lp => lp.entityType === "book" && seriesBooks.some(b => b.id === lp.entityId) && lp.language === page.language);
    }
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

  const handleTranslateLp = async (page: LandingPage, toLang: string) => {
    setTranslating(true);
    try {
      const translated = await aiTranslate(
        { title: page.title, description: page.description, metaTitle: page.metaTitle, metaDescription: page.metaDescription, captureHeading: page.captureHeading, captureSubheading: page.captureSubheading, captureButtonText: page.captureButtonText },
        page.language,
        toLang,
        "landing_page"
      );
      form.reset({
        entityType: page.entityType as LandingPageFormValues["entityType"],
        entityId: page.entityId,
        language: toLang,
        url: "",
        title: translated.title || page.title || "",
        description: translated.description || page.description || "",
        metaTitle: translated.metaTitle || page.metaTitle || "",
        metaDescription: translated.metaDescription || page.metaDescription || "",
        captureHeading: translated.captureHeading || page.captureHeading || "",
        captureSubheading: translated.captureSubheading || page.captureSubheading || "",
        captureButtonText: translated.captureButtonText || page.captureButtonText || "",
        mailingListId: null,
        isPublished: false,
      });
      setEditingId(null);
      setIsCreateOpen(true);
      toast({ title: `Traducido a ${languageLabels[toLang] || toLang}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTranslating(false);
    }
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
                      <div className="flex gap-2">
                        <FormControl>
                          <Input placeholder="https://tudominio.com/es/nombre-autor" {...field} />
                        </FormControl>
                        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={generateUrl} title="Generar URL automática desde dominio del autor">
                          <Globe className="h-4 w-4 mr-1" /> Auto
                        </Button>
                      </div>
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
                    <Button variant="ghost" size="icon" onClick={() => {
                      const desc = page.description || "";
                      const hook = (page as any).hookText || "";
                      const combined = [desc, hook].filter(Boolean).join("\n\n");
                      setProofreadInitialText(combined);
                      setProofreadOpen(true);
                    }} title="Corrector Ortotipográfico">
                      <SpellCheck className="h-4 w-4" />
                    </Button>
                    <Select onValueChange={(lang) => handleTranslateLp(page, lang)}>
                      <SelectTrigger className="w-8 h-8 p-0 border-0 bg-transparent justify-center" title="Traducir">
                        <Languages className="h-4 w-4" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(languageLabels).filter(([k]) => k !== page.language).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => setPreviewPage(page)} title="Vista previa">
                      <Eye className="h-4 w-4" />
                    </Button>
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
                {(() => {
                  const parent = getParentLandingPage(page);
                  const children = getChildLandingPages(page);
                  if (!parent && children.length === 0) return null;
                  return (
                    <div className="border-t border-border pt-2 mt-2 space-y-1">
                      {parent && (
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-muted-foreground">↑</span>
                          <span className="text-muted-foreground">{entityTypeLabels[parent.entityType]}:</span>
                          <button onClick={() => setPreviewPage(parent)} className="text-primary hover:underline truncate">{getEntityName(parent)}</button>
                        </div>
                      )}
                      {children.length > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">↓ {page.entityType === "author" ? "Series" : "Libros"}: </span>
                          {children.map((c, i) => (
                            <span key={c.id}>
                              {i > 0 && ", "}
                              <button onClick={() => setPreviewPage(c)} className="text-primary hover:underline">{getEntityName(c)}</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
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

      {previewPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-lg shadow-2xl">
            <button
              onClick={() => setPreviewPage(null)}
              className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="overflow-y-auto max-h-[90vh]">
              <LandingPagePreview page={previewPage} />
            </div>
          </div>
        </div>
      )}

      {translating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card p-6 rounded-lg shadow-xl flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Traduciendo landing page con IA...</span>
          </div>
        </div>
      )}

      <ProofreadDialog
        open={proofreadOpen}
        onOpenChange={setProofreadOpen}
        initialText={proofreadInitialText}
        onToast={toast}
      />
    </div>
  );
}

function LandingPagePreview({ page }: { page: LandingPage }) {
  const lang = page.language;

  const i18n: Record<string, {
    entityLabels: Record<string, string>;
    cta: { heading: string; sub: string; button: string };
    placeholders: { email: string; firstName: string; lastName: string };
    privacy: string;
    footer: { tagline: string; rights: string };
    listLabel: string;
    published: string;
    draft: string;
  }> = {
    es: {
      entityLabels: { author: "Autor", series: "Serie", book: "Libro" },
      cta: { heading: "Descarga tu thriller gratuito", sub: "Suscríbete y recibe tu copia digital al instante", button: "Quiero mi copia gratis" },
      placeholders: { email: "tu@email.com", firstName: "Nombre", lastName: "Apellido" },
      privacy: "Tu información está segura. Sin spam, solo thrillers.",
      footer: { tagline: "Thrillers Psicológicos", rights: "Todos los derechos reservados." },
      listLabel: "Lista",
      published: "Publicada",
      draft: "Borrador",
    },
    en: {
      entityLabels: { author: "Author", series: "Series", book: "Book" },
      cta: { heading: "Download your free thriller", sub: "Subscribe and get your digital copy instantly", button: "Get my free copy" },
      placeholders: { email: "you@email.com", firstName: "First Name", lastName: "Last Name" },
      privacy: "Your information is safe. No spam, just thrillers.",
      footer: { tagline: "Psychological Thrillers", rights: "All rights reserved." },
      listLabel: "List",
      published: "Published",
      draft: "Draft",
    },
    fr: {
      entityLabels: { author: "Auteur", series: "Série", book: "Livre" },
      cta: { heading: "Téléchargez votre thriller gratuit", sub: "Inscrivez-vous et recevez votre copie numérique", button: "Obtenir ma copie gratuite" },
      placeholders: { email: "vous@email.com", firstName: "Prénom", lastName: "Nom" },
      privacy: "Vos informations sont en sécurité. Pas de spam, que des thrillers.",
      footer: { tagline: "Thrillers Psychologiques", rights: "Tous droits réservés." },
      listLabel: "Liste",
      published: "Publiée",
      draft: "Brouillon",
    },
    de: {
      entityLabels: { author: "Autor", series: "Serie", book: "Buch" },
      cta: { heading: "Laden Sie Ihren kostenlosen Thriller herunter", sub: "Abonnieren Sie und erhalten Sie sofort Ihre digitale Kopie", button: "Meine Gratiskopie erhalten" },
      placeholders: { email: "du@email.com", firstName: "Vorname", lastName: "Nachname" },
      privacy: "Ihre Daten sind sicher. Kein Spam, nur Thriller.",
      footer: { tagline: "Psychothriller", rights: "Alle Rechte vorbehalten." },
      listLabel: "Liste",
      published: "Veröffentlicht",
      draft: "Entwurf",
    },
    it: {
      entityLabels: { author: "Autore", series: "Serie", book: "Libro" },
      cta: { heading: "Scarica il tuo thriller gratuito", sub: "Iscriviti e ricevi subito la tua copia digitale", button: "Voglio la mia copia gratis" },
      placeholders: { email: "tu@email.com", firstName: "Nome", lastName: "Cognome" },
      privacy: "I tuoi dati sono al sicuro. Niente spam, solo thriller.",
      footer: { tagline: "Thriller Psicologici", rights: "Tutti i diritti riservati." },
      listLabel: "Lista",
      published: "Pubblicata",
      draft: "Bozza",
    },
    pt: {
      entityLabels: { author: "Autor", series: "Série", book: "Livro" },
      cta: { heading: "Baixe o seu thriller gratuito", sub: "Inscreva-se e receba a sua cópia digital instantaneamente", button: "Quero a minha cópia grátis" },
      placeholders: { email: "voce@email.com", firstName: "Nome", lastName: "Sobrenome" },
      privacy: "As suas informações estão seguras. Sem spam, apenas thrillers.",
      footer: { tagline: "Thrillers Psicológicos", rights: "Todos os direitos reservados." },
      listLabel: "Lista",
      published: "Publicada",
      draft: "Rascunho",
    },
  };

  const t = i18n[lang] || i18n.es;
  const heading = page.captureHeading || t.cta.heading;
  const subheading = page.captureSubheading || t.cta.sub;
  const buttonText = page.captureButtonText || t.cta.button;

  return (
    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", background: "#0d0d1a", color: "#e0e0e0", minHeight: "100%" }}>
      <div style={{ background: "linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)", padding: "60px 20px 40px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: "#d4a574", marginBottom: 16, textTransform: "uppercase" }}>
            {t.entityLabels[page.entityType] || page.entityType}
          </div>
          <h1 style={{ fontSize: 42, fontWeight: "bold", color: "#ffffff", marginBottom: 12, lineHeight: 1.1 }}>
            {page.title || page.entityName}
          </h1>
          {page.entityName && page.title && (
            <div style={{ fontSize: 18, color: "#d4a574", marginBottom: 20 }}>
              {page.entityName}
            </div>
          )}
          {page.description && (
            <p style={{ fontSize: 18, color: "#b0b0b0", lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
              {page.description}
            </p>
          )}
        </div>
      </div>

      <div style={{ background: "#12122a", padding: "50px 20px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", background: "#1a1a2e", borderRadius: 12, padding: "40px 32px", border: "1px solid #2a2a4a", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
          <h2 style={{ fontSize: 24, fontWeight: "bold", color: "#d4a574", textAlign: "center", marginBottom: 8 }}>
            {heading}
          </h2>
          <p style={{ fontSize: 14, color: "#888", textAlign: "center", marginBottom: 24 }}>
            {subheading}
          </p>

          <div style={{ marginBottom: 16 }}>
            <input
              type="email"
              placeholder={t.placeholders.email}
              disabled
              style={{
                width: "100%",
                padding: "14px 16px",
                background: "#0d0d1a",
                border: "1px solid #333",
                borderRadius: 6,
                color: "#666",
                fontSize: 15,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input
              type="text"
              placeholder={t.placeholders.firstName}
              disabled
              style={{
                padding: "12px 14px",
                background: "#0d0d1a",
                border: "1px solid #333",
                borderRadius: 6,
                color: "#666",
                fontSize: 14,
              }}
            />
            <input
              type="text"
              placeholder={t.placeholders.lastName}
              disabled
              style={{
                padding: "12px 14px",
                background: "#0d0d1a",
                border: "1px solid #333",
                borderRadius: 6,
                color: "#666",
                fontSize: 14,
              }}
            />
          </div>

          <button
            disabled
            style={{
              width: "100%",
              padding: "14px",
              background: "#d4a574",
              color: "#1a1a2e",
              border: "none",
              borderRadius: 6,
              fontSize: 16,
              fontWeight: "bold",
              cursor: "default",
              letterSpacing: 1,
            }}
          >
            {buttonText.toUpperCase()}
          </button>

          <p style={{ fontSize: 11, color: "#555", textAlign: "center", marginTop: 16 }}>
            {t.privacy}
          </p>
        </div>
      </div>

      {page.mailingListName && (
        <div style={{ background: "#0d0d1a", padding: "20px", borderTop: "1px solid #1a1a2e" }}>
          <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#444" }}>
              {t.listLabel}: {page.mailingListName} • {page.language.toUpperCase()} • {page.isPublished ? t.published : t.draft}
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#0a0a18", padding: "30px 20px", textAlign: "center", borderTop: "1px solid #1a1a2e" }}>
        <div style={{ fontSize: 18, color: "#d4a574", fontWeight: "bold", marginBottom: 4 }}>Lennox Hale</div>
        <div style={{ fontSize: 12, color: "#555", letterSpacing: 2, textTransform: "uppercase" }}>{t.footer.tagline}</div>
        <div style={{ fontSize: 11, color: "#333", marginTop: 16 }}>© {new Date().getFullYear()} Lennox Hale Publishing. {t.footer.rights}</div>
      </div>
    </div>
  );
}

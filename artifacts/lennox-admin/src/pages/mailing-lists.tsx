import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useListMailingLists,
  getListMailingListsQueryKey,
  useCreateMailingList,
  useUpdateMailingList,
  useDeleteMailingList,
  useListAuthors,
  getListAuthorsQueryKey,
  useListBooks,
  getListBooksQueryKey,
  useGetSubscriberStats,
  getGetSubscriberStatsQueryKey,
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
import { Plus, Edit2, Trash2, Mail, Globe, Users, BookOpen } from "lucide-react";
import type { MailingList } from "@workspace/api-client-react";

const mailingListSchema = z.object({
  authorId: z.coerce.number().min(1, "El autor es requerido"),
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional().nullable(),
  language: z.string().min(1, "El idioma es requerido"),
  leadMagnetBookId: z.coerce.number().optional().nullable(),
  landingPageUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

type MailingListFormValues = z.infer<typeof mailingListSchema>;

export default function MailingLists() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterAuthor, setFilterAuthor] = useState<string>("all");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams: Record<string, number | undefined> = {};
  if (filterAuthor !== "all") listParams.authorId = Number(filterAuthor);

  const { data: mailingLists, isLoading } = useListMailingLists(
    filterLanguage !== "all" ? { ...listParams, language: filterLanguage } : listParams,
    { query: { queryKey: getListMailingListsQueryKey(filterLanguage !== "all" ? { ...listParams, language: filterLanguage } : listParams) } }
  );

  const { data: authors } = useListAuthors({ query: { queryKey: getListAuthorsQueryKey() } });
  const { data: books } = useListBooks(undefined, { query: { queryKey: getListBooksQueryKey() } });
  const { data: stats } = useGetSubscriberStats({ query: { queryKey: getGetSubscriberStatsQueryKey() } });

  const createMailingList = useCreateMailingList();
  const updateMailingList = useUpdateMailingList();
  const deleteMailingList = useDeleteMailingList();

  const leadMagnetBooks = books?.filter(b => b.funnelRole === "lead_magnet") ?? [];

  const form = useForm<MailingListFormValues>({
    resolver: zodResolver(mailingListSchema),
    defaultValues: {
      authorId: 0,
      name: "",
      description: "",
      language: "es",
      leadMagnetBookId: null,
      landingPageUrl: "",
      isActive: true,
    },
  });

  const onSubmit = (data: MailingListFormValues) => {
    const payload = {
      ...data,
      leadMagnetBookId: data.leadMagnetBookId || undefined,
    };

    if (editingId) {
      updateMailingList.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMailingListsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSubscriberStatsQueryKey() });
          toast({ title: "Lista actualizada exitosamente" });
          setIsCreateOpen(false);
          setEditingId(null);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al actualizar lista", variant: "destructive" });
        }
      });
    } else {
      createMailingList.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMailingListsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSubscriberStatsQueryKey() });
          toast({ title: "Lista creada exitosamente" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al crear lista", variant: "destructive" });
        }
      });
    }
  };

  const handleEdit = (list: MailingList) => {
    setEditingId(list.id);
    form.reset({
      authorId: list.authorId,
      name: list.name,
      description: list.description || "",
      language: list.language,
      leadMagnetBookId: list.leadMagnetBookId,
      landingPageUrl: list.landingPageUrl || "",
      isActive: list.isActive,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteMailingList.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMailingListsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSubscriberStatsQueryKey() });
        toast({ title: "Lista eliminada" });
      },
      onError: () => {
        toast({ title: "Error al eliminar lista", variant: "destructive" });
      }
    });
  };

  const languages = [...new Set(mailingLists?.map(l => l.language) ?? [])];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Listas de Correo</h2>
          <p className="text-muted-foreground">Gestion de listas de captacion separadas por autor e idioma.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setEditingId(null);
            form.reset({ authorId: 0, name: "", description: "", language: "es", leadMagnetBookId: null, landingPageUrl: "", isActive: true });
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-list"><Plus className="mr-2 h-4 w-4" /> Nueva Lista</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Lista" : "Crear Lista de Correo"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="authorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Autor *</FormLabel>
                        <Select onValueChange={field.onChange} value={String(field.value || "")}>
                          <FormControl>
                            <SelectTrigger data-testid="select-author">
                              <SelectValue placeholder="Seleccionar autor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {authors?.map(a => (
                              <SelectItem key={a.id} value={String(a.id)}>{a.penName}</SelectItem>
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
                            <SelectTrigger data-testid="select-language">
                              <SelectValue placeholder="Seleccionar idioma" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="es">Espanol</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="fr">Francais</SelectItem>
                            <SelectItem value="de">Deutsch</SelectItem>
                            <SelectItem value="it">Italiano</SelectItem>
                            <SelectItem value="pt">Portugues</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la Lista *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Lennox Hale - Espanol" {...field} data-testid="input-list-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripcion</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Descripcion de la lista" {...field} value={field.value || ""} data-testid="input-list-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="leadMagnetBookId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lead Magnet (Libro gratuito)</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))} value={field.value ? String(field.value) : "none"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-lead-magnet">
                            <SelectValue placeholder="Sin lead magnet" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin lead magnet</SelectItem>
                          {leadMagnetBooks.map(b => (
                            <SelectItem key={b.id} value={String(b.id)}>{b.title} ({b.seriesName})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="landingPageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL de la Landing Page</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} value={field.value || ""} data-testid="input-landing-url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormLabel>Lista activa</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-active" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createMailingList.isPending || updateMailingList.isPending} data-testid="button-submit-list">
                    {editingId ? "Guardar Cambios" : "Crear Lista"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Suscriptores</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-subs">{stats.totalSubscribers}</div>
              <p className="text-xs text-muted-foreground">{stats.activeSubscribers} activos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Listas Activas</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-lists">{stats.activeMailingLists}</div>
              <p className="text-xs text-muted-foreground">de {stats.totalMailingLists} totales</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Por Idioma</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {stats.subscribersByLanguage.map((item) => (
                  <div key={item.language} className="flex justify-between text-sm">
                    <span className="text-muted-foreground uppercase">{item.language}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
                {stats.subscribersByLanguage.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin datos</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Por Fuente</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {stats.subscribersBySource.map((item) => (
                  <div key={item.source} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.source.replace(/_/g, " ")}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
                {stats.subscribersBySource.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin datos</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex gap-3">
        <Select value={filterAuthor} onValueChange={setFilterAuthor}>
          <SelectTrigger className="w-48" data-testid="filter-author">
            <SelectValue placeholder="Todos los autores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los autores</SelectItem>
            {authors?.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.penName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterLanguage} onValueChange={setFilterLanguage}>
          <SelectTrigger className="w-48" data-testid="filter-language">
            <SelectValue placeholder="Todos los idiomas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los idiomas</SelectItem>
            <SelectItem value="es">Espanol</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="fr">Francais</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : mailingLists && mailingLists.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mailingLists.map((list) => (
            <Card key={list.id} className="flex flex-col" data-testid={`card-list-${list.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {list.name}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge variant={list.isActive ? "default" : "secondary"}>
                        {list.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                      <Badge variant="outline" className="uppercase">{list.language}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(list)} data-testid={`button-edit-list-${list.id}`}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-list-${list.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar lista?</AlertDialogTitle>
                          <AlertDialogDescription>Se eliminaran todos los suscriptores asociados.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(list.id)} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Autor:</span>
                  <span className="font-medium">{list.authorPenName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Suscriptores:</span>
                  <span className="font-bold text-primary text-lg">{list.subscriberCount}</span>
                </div>
                {list.leadMagnetBookTitle && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Lead Magnet: </span>
                    <span className="font-medium">{list.leadMagnetBookTitle}</span>
                  </div>
                )}
                {list.landingPageUrl && (
                  <div className="text-xs truncate">
                    <a href={list.landingPageUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {list.landingPageUrl}
                    </a>
                  </div>
                )}
                {list.description && (
                  <p className="text-xs text-muted-foreground bg-muted p-2 rounded-md line-clamp-2">{list.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No hay listas de correo registradas.</p>
        </div>
      )}
    </div>
  );
}

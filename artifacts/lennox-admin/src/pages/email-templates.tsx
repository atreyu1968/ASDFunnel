import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useListEmailTemplates,
  getListEmailTemplatesQueryKey,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
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
import { Plus, Edit2, Trash2, Mail, FileCode } from "lucide-react";
import type { EmailTemplate } from "@workspace/api-client-react";

const templateTypeLabels: Record<string, string> = {
  welcome: "Bienvenida",
  lead_magnet_delivery: "Entrega Lead Magnet",
  new_release: "Nuevo Lanzamiento",
  series_update: "Actualización de Serie",
  promotional: "Promocional",
  re_engagement: "Re-engagement",
};

const templateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  subject: z.string().min(1, "El asunto es requerido"),
  bodyHtml: z.string().min(1, "El contenido HTML es requerido"),
  bodyText: z.string().optional().nullable(),
  language: z.string().min(1, "El idioma es requerido"),
  templateType: z.enum(["welcome", "lead_magnet_delivery", "new_release", "series_update", "promotional", "re_engagement"]),
  mailingListId: z.coerce.number().optional().nullable(),
  isActive: z.boolean().optional(),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export default function EmailTemplates() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams: Record<string, string | undefined> = {};
  if (filterType !== "all") listParams.templateType = filterType;
  if (filterLanguage !== "all") listParams.language = filterLanguage;

  const { data: templates, isLoading } = useListEmailTemplates(
    listParams,
    { query: { queryKey: getListEmailTemplatesQueryKey(listParams) } }
  );

  const { data: mailingLists } = useListMailingLists(undefined, { query: { queryKey: getListMailingListsQueryKey() } });

  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      subject: "",
      bodyHtml: "",
      bodyText: "",
      language: "es",
      templateType: "welcome",
      mailingListId: null,
      isActive: true,
    },
  });

  const onSubmit = (data: TemplateFormValues) => {
    const payload = {
      ...data,
      mailingListId: data.mailingListId || undefined,
    };

    if (editingId) {
      updateTemplate.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEmailTemplatesQueryKey() });
          toast({ title: "Plantilla actualizada" });
          setIsCreateOpen(false);
          setEditingId(null);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al actualizar", variant: "destructive" });
        }
      });
    } else {
      createTemplate.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListEmailTemplatesQueryKey() });
          toast({ title: "Plantilla creada" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al crear", variant: "destructive" });
        }
      });
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingId(template.id);
    form.reset({
      name: template.name,
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText || "",
      language: template.language,
      templateType: template.templateType as TemplateFormValues["templateType"],
      mailingListId: template.mailingListId,
      isActive: template.isActive,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteTemplate.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmailTemplatesQueryKey() });
        toast({ title: "Plantilla eliminada" });
      },
      onError: () => {
        toast({ title: "Error al eliminar", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Plantillas de Email</h2>
          <p className="text-muted-foreground">Plantillas de correo separadas por tipo e idioma.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setEditingId(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Plantilla</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Plantilla" : "Crear Plantilla de Email"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="templateType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(templateTypeLabels).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
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
                  <FormField
                    control={form.control}
                    name="mailingListId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lista de Correo</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))} value={field.value ? String(field.value) : "none"}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Todas las listas</SelectItem>
                            {mailingLists?.map(ml => (
                              <SelectItem key={ml.id} value={String(ml.id)}>{ml.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Interno *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Bienvenida Sloane Keller ES" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asunto del Email *</FormLabel>
                      <FormControl>
                        <Input placeholder="Tu copia gratuita está lista..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bodyHtml"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenido HTML *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="<html>...</html>" className="font-mono text-xs" rows={8} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bodyText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenido Texto Plano</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Versión de texto plano..." rows={4} {...field} value={field.value || ""} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormLabel>Activa</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending}>
                    {editingId ? "Guardar Cambios" : "Crear Plantilla"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todos los tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(templateTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
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

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{template.name}</span>
                    </CardTitle>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant={template.isActive ? "default" : "secondary"}>
                        {template.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                      <Badge variant="outline">{templateTypeLabels[template.templateType] || template.templateType}</Badge>
                      <Badge variant="outline" className="uppercase">{template.language}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setPreviewTemplate(template)} title="Vista previa">
                      <FileCode className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
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
                          <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
                          <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(template.id)} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Asunto: </span>
                  <span className="font-medium">{template.subject}</span>
                </div>
                {template.mailingListName && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Lista: </span>
                    <span className="font-medium">{template.mailingListName}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Actualizada: {format(new Date(template.updatedAt), "d MMM yyyy", { locale: es })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No hay plantillas de email registradas.</p>
        </div>
      )}

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa: {previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Asunto: </span>
                <span className="font-medium">{previewTemplate.subject}</span>
              </div>
              <div className="border rounded-lg p-4 bg-white text-black">
                <div dangerouslySetInnerHTML={{ __html: previewTemplate.bodyHtml }} />
              </div>
              {previewTemplate.bodyText && (
                <div className="border rounded-lg p-4 bg-muted">
                  <p className="text-xs font-mono whitespace-pre-wrap">{previewTemplate.bodyText}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

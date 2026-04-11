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
  useListBooks,
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
import { Plus, Edit2, Trash2, Mail, FileCode, Eye, Brain, Languages, Sparkles, Loader2, Copy, Check, SpellCheck } from "lucide-react";
import type { EmailTemplate } from "@workspace/api-client-react";
import { aiGenerateEmail, aiTranslate, aiGenerateSubjects, aiGenerateSequence } from "@/lib/ai-api";
import { ProofreadDialog } from "@/components/proofread-dialog";

const templateTypeLabels: Record<string, string> = {
  welcome: "Bienvenida",
  lead_magnet_delivery: "Entrega Lead Magnet",
  new_release: "Nuevo Lanzamiento",
  series_update: "Actualización de Serie",
  promotional: "Promocional",
  re_engagement: "Re-engagement",
  confirmation: "Confirmación",
  unsubscribe: "Baja / Unsubscribe",
};

const templateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  subject: z.string().min(1, "El asunto es requerido"),
  bodyHtml: z.string().min(1, "El contenido HTML es requerido"),
  bodyText: z.string().optional().nullable(),
  language: z.string().min(1, "El idioma es requerido"),
  templateType: z.enum(["welcome", "lead_magnet_delivery", "new_release", "series_update", "promotional", "re_engagement", "confirmation", "unsubscribe"]),
  mailingListId: z.coerce.number().optional().nullable(),
  isActive: z.boolean().optional(),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

const languageLabels: Record<string, string> = {
  es: "Español", en: "English", fr: "Français", de: "Deutsch", pt: "Português", it: "Italiano",
};

export default function EmailTemplates() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterLanguage, setFilterLanguage] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [previewTab, setPreviewTab] = useState<"html" | "text" | "code">("html");
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [subjectVariants, setSubjectVariants] = useState<any[] | null>(null);
  const [subjectTemplateId, setSubjectTemplateId] = useState<number | null>(null);
  const [translateTarget, setTranslateTarget] = useState<{ template: EmailTemplate; lang: string } | null>(null);
  const [sequenceResult, setSequenceResult] = useState<any[] | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [aiBookId, setAiBookId] = useState<number>(0);
  const [aiTemplateType, setAiTemplateType] = useState<string>("welcome");
  const [aiLang, setAiLang] = useState<string>("es");
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [seqBookId, setSeqBookId] = useState<number>(0);
  const [seqLang, setSeqLang] = useState<string>("es");
  const [proofreadOpen, setProofreadOpen] = useState(false);
  const [proofreadInitialText, setProofreadInitialText] = useState("");

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

  const { data: books } = useListBooks(undefined, { query: { queryKey: ["books-for-ai"] } });

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

  const handleAiGenerate = async () => {
    if (!aiBookId) return;
    setAiLoading("generate");
    try {
      const result = await aiGenerateEmail(aiBookId, aiTemplateType, aiLang);
      form.reset({
        name: result.name,
        subject: result.subject,
        bodyHtml: result.bodyHtml,
        bodyText: result.bodyText || "",
        language: aiLang,
        templateType: aiTemplateType as TemplateFormValues["templateType"],
        mailingListId: null,
        isActive: true,
      });
      setAiGenerateOpen(false);
      setEditingId(null);
      setIsCreateOpen(true);
      toast({ title: "Email generado con IA", description: result.subject });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  };

  const handleAiSubjects = async (templateId: number) => {
    setAiLoading("subjects");
    setSubjectTemplateId(templateId);
    try {
      const subjects = await aiGenerateSubjects(templateId, 5);
      setSubjectVariants(subjects);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  };

  const handleTranslate = async (template: EmailTemplate, toLang: string) => {
    setAiLoading("translate");
    try {
      const translated = await aiTranslate(
        { name: template.name, subject: template.subject, bodyHtml: template.bodyHtml, bodyText: template.bodyText },
        template.language,
        toLang,
        "email_template"
      );
      form.reset({
        name: translated.name || template.name,
        subject: translated.subject || template.subject,
        bodyHtml: translated.bodyHtml || template.bodyHtml,
        bodyText: translated.bodyText || template.bodyText || "",
        language: toLang,
        templateType: template.templateType as TemplateFormValues["templateType"],
        mailingListId: null,
        isActive: true,
      });
      setEditingId(null);
      setIsCreateOpen(true);
      toast({ title: `Traducido a ${languageLabels[toLang] || toLang}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(null);
      setTranslateTarget(null);
    }
  };

  const handleGenerateSequence = async () => {
    if (!seqBookId) return;
    setAiLoading("sequence");
    try {
      const sequence = await aiGenerateSequence(seqBookId, seqLang, 5);
      setSequenceResult(sequence);
      toast({ title: `Secuencia de ${sequence.length} emails generada` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  };

  const handleSaveSequenceEmail = (email: any) => {
    createTemplate.mutate({
      data: {
        name: email.name,
        subject: email.subject,
        bodyHtml: email.bodyHtml,
        bodyText: email.bodyText || "",
        language: seqLang,
        templateType: email.templateType || "welcome",
        isActive: true,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmailTemplatesQueryKey() });
        toast({ title: `"${email.name}" guardado` });
      }
    });
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Plantillas de Email</h2>
          <p className="text-muted-foreground">Plantillas de correo separadas por tipo e idioma.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSequenceOpen(true)} disabled={aiLoading === "sequence"}>
            {aiLoading === "sequence" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Secuencia IA
          </Button>
          <Button variant="outline" onClick={() => setAiGenerateOpen(true)} disabled={!!aiLoading}>
            {aiLoading === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
            Generar con IA
          </Button>
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
                  <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                    <Button variant="ghost" size="icon" onClick={() => {
                      const plainText = template.bodyText || template.bodyHtml?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "";
                      setProofreadInitialText(plainText);
                      setProofreadOpen(true);
                    }} title="Corrector Ortotipográfico">
                      <SpellCheck className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleAiSubjects(template.id)} title="A/B Asuntos IA" disabled={aiLoading === "subjects"}>
                      {aiLoading === "subjects" && subjectTemplateId === template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                    <Select onValueChange={(lang) => handleTranslate(template, lang)}>
                      <SelectTrigger className="w-8 h-8 p-0 border-0 bg-transparent justify-center" title="Traducir">
                        <Languages className="h-4 w-4" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(languageLabels).filter(([k]) => k !== template.language).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={() => setPreviewTemplate(template)} title="Vista previa">
                      <Eye className="h-4 w-4" />
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

      <Dialog open={!!previewTemplate} onOpenChange={() => { setPreviewTemplate(null); setPreviewTab("html"); }}>
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Vista Previa
            </DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="flex flex-col gap-3 min-h-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline">{templateTypeLabels[previewTemplate.templateType] || previewTemplate.templateType}</Badge>
                <Badge variant="outline" className="uppercase">{previewTemplate.language}</Badge>
                {previewTemplate.mailingListName && (
                  <Badge variant="secondary">{previewTemplate.mailingListName}</Badge>
                )}
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <div className="text-xs text-muted-foreground">De: <span className="text-foreground">{"{{autor_nombre}}"} &lt;noreply@tueditorial.com&gt;</span></div>
                <div className="text-xs text-muted-foreground">Asunto: <span className="text-foreground font-medium">{previewTemplate.subject}</span></div>
              </div>
              <div className="flex gap-1 border-b border-border">
                <button
                  onClick={() => setPreviewTab("html")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${previewTab === "html" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  HTML
                </button>
                <button
                  onClick={() => setPreviewTab("text")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${previewTab === "text" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  Texto plano
                </button>
                <button
                  onClick={() => setPreviewTab("code")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${previewTab === "code" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  Código
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
                {previewTab === "html" && (
                  <iframe
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#e5e5e5;}</style></head><body>${previewTemplate.bodyHtml}</body></html>`}
                    className="w-full border-0 rounded-lg"
                    style={{ height: "480px" }}
                    title="Vista previa HTML"
                    sandbox="allow-same-origin"
                  />
                )}
                {previewTab === "text" && (
                  <div className="p-4 bg-muted/50 font-mono text-xs whitespace-pre-wrap min-h-[200px]">
                    {previewTemplate.bodyText || "(Sin versión de texto plano)"}
                  </div>
                )}
                {previewTab === "code" && (
                  <div className="p-4 bg-muted/50 font-mono text-xs whitespace-pre-wrap min-h-[200px] overflow-x-auto">
                    {previewTemplate.bodyHtml}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={aiGenerateOpen} onOpenChange={setAiGenerateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Generar Email con IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Libro</label>
              <Select onValueChange={(v) => setAiBookId(Number(v))} value={aiBookId ? aiBookId.toString() : undefined}>
                <SelectTrigger><SelectValue placeholder="Seleccionar libro" /></SelectTrigger>
                <SelectContent>
                  {books?.map((b: any) => (
                    <SelectItem key={b.id} value={b.id.toString()}>#{b.bookNumber} {b.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <Select onValueChange={setAiTemplateType} value={aiTemplateType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(templateTypeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Idioma</label>
                <Select onValueChange={setAiLang} value={aiLang}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(languageLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleAiGenerate} disabled={!aiBookId || aiLoading === "generate"} className="w-full">
              {aiLoading === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Generar Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sequenceOpen} onOpenChange={(open) => { setSequenceOpen(open); if (!open) setSequenceResult(null); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Generar Secuencia de Nurturing</DialogTitle>
          </DialogHeader>
          {!sequenceResult ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Libro</label>
                <Select onValueChange={(v) => setSeqBookId(Number(v))} value={seqBookId ? seqBookId.toString() : undefined}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar libro" /></SelectTrigger>
                  <SelectContent>
                    {books?.map((b: any) => (
                      <SelectItem key={b.id} value={b.id.toString()}>#{b.bookNumber} {b.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Idioma</label>
                <Select onValueChange={setSeqLang} value={seqLang}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(languageLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGenerateSequence} disabled={!seqBookId || aiLoading === "sequence"} className="w-full">
                {aiLoading === "sequence" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generar 5 emails de secuencia
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sequenceResult.map((email: any, i: number) => (
                <Card key={i} className="bg-muted/30">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Día {email.day}</Badge>
                        <span className="font-medium text-sm">{email.name}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleSaveSequenceEmail(email)}>
                        Guardar
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">Asunto: {email.subject}</div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" className="w-full" onClick={() => {
                sequenceResult.forEach((email: any) => handleSaveSequenceEmail(email));
              }}>
                Guardar todos ({sequenceResult.length})
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!subjectVariants} onOpenChange={() => { setSubjectVariants(null); setSubjectTemplateId(null); }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Variantes de Asunto A/B</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {subjectVariants?.map((v: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{v.subject}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{v.technique}</Badge>
                    {v.reasoning}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => copyToClipboard(v.subject, i)}>
                  {copiedIdx === i ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {aiLoading === "translate" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card p-6 rounded-lg shadow-xl flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Traduciendo con IA...</span>
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

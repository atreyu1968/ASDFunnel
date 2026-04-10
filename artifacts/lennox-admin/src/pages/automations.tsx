import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useListAutomationRules,
  getListAutomationRulesQueryKey,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  useToggleAutomationRule,
  useExecuteAutomationRule,
  useListMailingLists,
  getListMailingListsQueryKey,
  useListEmailTemplates,
  getListEmailTemplatesQueryKey,
  useListAutomationLogs,
  getListAutomationLogsQueryKey,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Zap, Play, Power, Activity, Clock } from "lucide-react";
import type { AutomationRule } from "@workspace/api-client-react";

const triggerTypeLabels: Record<string, string> = {
  new_subscriber: "Nuevo Suscriptor",
  book_published: "Libro Publicado",
  series_complete: "Serie Completada",
  subscriber_tagged: "Suscriptor Etiquetado",
  scheduled: "Programada",
};

const actionTypeLabels: Record<string, string> = {
  send_email: "Enviar Email",
  assign_tag: "Asignar Etiqueta",
  move_to_list: "Mover a Lista",
  send_lead_magnet: "Enviar Lead Magnet",
  welcome_sequence: "Secuencia de Bienvenida",
};

const ruleSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional().nullable(),
  triggerType: z.enum(["new_subscriber", "book_published", "series_complete", "subscriber_tagged", "scheduled"]),
  triggerConfig: z.string().optional().nullable(),
  actionType: z.enum(["send_email", "assign_tag", "move_to_list", "send_lead_magnet", "welcome_sequence"]),
  actionConfig: z.string().optional().nullable(),
  mailingListId: z.coerce.number().optional().nullable(),
  emailTemplateId: z.coerce.number().optional().nullable(),
  isActive: z.boolean().optional(),
});

type RuleFormValues = z.infer<typeof ruleSchema>;

export default function Automations() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterTrigger, setFilterTrigger] = useState<string>("all");
  const [showLogs, setShowLogs] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams: Record<string, string | boolean | undefined> = {};
  if (filterTrigger !== "all") listParams.triggerType = filterTrigger;

  const { data: rules, isLoading } = useListAutomationRules(
    listParams,
    { query: { queryKey: getListAutomationRulesQueryKey(listParams) } }
  );

  const { data: mailingLists } = useListMailingLists(undefined, { query: { queryKey: getListMailingListsQueryKey() } });
  const { data: emailTemplates } = useListEmailTemplates(undefined, { query: { queryKey: getListEmailTemplatesQueryKey() } });
  const { data: logs } = useListAutomationLogs(
    { limit: 30 },
    { query: { queryKey: getListAutomationLogsQueryKey({ limit: 30 }), enabled: showLogs } }
  );

  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const toggleRule = useToggleAutomationRule();
  const executeRule = useExecuteAutomationRule();

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: "",
      description: "",
      triggerType: "new_subscriber",
      triggerConfig: "",
      actionType: "send_email",
      actionConfig: "",
      mailingListId: null,
      emailTemplateId: null,
      isActive: true,
    },
  });

  const onSubmit = (data: RuleFormValues) => {
    let triggerConfig = null;
    let actionConfig = null;
    try { if (data.triggerConfig) triggerConfig = JSON.parse(data.triggerConfig); } catch { /* leave null */ }
    try { if (data.actionConfig) actionConfig = JSON.parse(data.actionConfig); } catch { /* leave null */ }

    const payload = {
      name: data.name,
      description: data.description,
      triggerType: data.triggerType,
      triggerConfig,
      actionType: data.actionType,
      actionConfig,
      mailingListId: data.mailingListId || undefined,
      emailTemplateId: data.emailTemplateId || undefined,
      isActive: data.isActive,
    };

    if (editingId) {
      updateRule.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAutomationRulesQueryKey() });
          toast({ title: "Regla actualizada" });
          setIsCreateOpen(false);
          setEditingId(null);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al actualizar", variant: "destructive" });
        }
      });
    } else {
      createRule.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAutomationRulesQueryKey() });
          toast({ title: "Regla creada" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al crear", variant: "destructive" });
        }
      });
    }
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingId(rule.id);
    form.reset({
      name: rule.name,
      description: rule.description || "",
      triggerType: rule.triggerType as RuleFormValues["triggerType"],
      triggerConfig: rule.triggerConfig ? JSON.stringify(rule.triggerConfig) : "",
      actionType: rule.actionType as RuleFormValues["actionType"],
      actionConfig: rule.actionConfig ? JSON.stringify(rule.actionConfig) : "",
      mailingListId: rule.mailingListId,
      emailTemplateId: rule.emailTemplateId,
      isActive: rule.isActive,
    });
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteRule.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAutomationRulesQueryKey() });
        toast({ title: "Regla eliminada" });
      },
      onError: () => {
        toast({ title: "Error al eliminar", variant: "destructive" });
      }
    });
  };

  const handleToggle = (id: number) => {
    toggleRule.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAutomationRulesQueryKey() });
        toast({ title: "Estado cambiado" });
      },
    });
  };

  const handleExecute = (id: number) => {
    executeRule.mutate({ id }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListAutomationRulesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAutomationLogsQueryKey() });
        const result = data as { executed?: number; succeeded?: number; failed?: number };
        toast({ title: `Ejecución completada: ${result.executed ?? 0} procesados, ${result.succeeded ?? 0} exitosos` });
      },
      onError: () => {
        toast({ title: "Error al ejecutar", variant: "destructive" });
      }
    });
  };

  const activeRules = rules?.filter(r => r.isActive).length ?? 0;
  const totalExecutions = rules?.reduce((sum, r) => sum + r.executionCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Automatizaciones</h2>
          <p className="text-muted-foreground">Reglas automáticas de correo, etiquetas y secuencias.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowLogs(!showLogs)}>
            <Activity className="mr-2 h-4 w-4" />
            {showLogs ? "Ocultar Logs" : "Ver Logs"}
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setEditingId(null);
              form.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nueva Regla</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Regla" : "Crear Regla de Automatización"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej. Bienvenida nuevos suscriptores ES" {...field} />
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
                        <FormLabel>Descripción</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Descripción de la regla" {...field} value={field.value || ""} rows={2} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="triggerType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Disparador *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(triggerTypeLabels).map(([k, v]) => (
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
                      name="actionType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Acción *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(actionTypeLabels).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v}</SelectItem>
                              ))}
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
                      name="triggerConfig"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Config Disparador (JSON)</FormLabel>
                          <FormControl>
                            <Textarea placeholder='{"tag": "vip"}' className="font-mono text-xs" rows={3} {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="actionConfig"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Config Acción (JSON)</FormLabel>
                          <FormControl>
                            <Textarea placeholder='{"tag": "new"}' className="font-mono text-xs" rows={3} {...field} value={field.value || ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                    <FormField
                      control={form.control}
                      name="emailTemplateId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plantilla de Email</FormLabel>
                          <Select onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))} value={field.value ? String(field.value) : "none"}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Sin plantilla</SelectItem>
                              {emailTemplates?.map(et => (
                                <SelectItem key={et.id} value={String(et.id)}>{et.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
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
                    <Button type="submit" disabled={createRule.isPending || updateRule.isPending}>
                      {editingId ? "Guardar Cambios" : "Crear Regla"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reglas Activas</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{activeRules}</div>
            <p className="text-xs text-muted-foreground">de {rules?.length ?? 0} totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ejecuciones Totales</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalExecutions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Última Ejecución</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {(() => {
              const lastExec = rules?.filter(r => r.lastExecutedAt).sort((a, b) => new Date(b.lastExecutedAt!).getTime() - new Date(a.lastExecutedAt!).getTime())[0];
              return lastExec?.lastExecutedAt ? (
                <div className="text-sm font-medium">{format(new Date(lastExec.lastExecutedAt), "d MMM yyyy HH:mm", { locale: es })}</div>
              ) : (
                <div className="text-sm text-muted-foreground">Sin ejecuciones</div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Select value={filterTrigger} onValueChange={setFilterTrigger}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todos los disparadores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los disparadores</SelectItem>
            {Object.entries(triggerTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="space-y-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3">
                      <Zap className={`h-5 w-5 ${rule.isActive ? "text-amber-500" : "text-muted-foreground"}`} />
                      <h3 className="text-lg font-semibold">{rule.name}</h3>
                      <Badge variant={rule.isActive ? "default" : "secondary"}>
                        {rule.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground ml-8">{rule.description}</p>
                    )}
                    <div className="flex gap-4 ml-8 text-sm">
                      <div>
                        <span className="text-muted-foreground">Disparador: </span>
                        <Badge variant="outline">{triggerTypeLabels[rule.triggerType] || rule.triggerType}</Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Acción: </span>
                        <Badge variant="outline">{actionTypeLabels[rule.actionType] || rule.actionType}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-4 ml-8 text-sm text-muted-foreground">
                      {rule.mailingListName && <span>Lista: {rule.mailingListName}</span>}
                      {rule.emailTemplateName && <span>Plantilla: {rule.emailTemplateName}</span>}
                      <span>Ejecuciones: {rule.executionCount}</span>
                      {rule.lastExecutedAt && (
                        <span>Última: {format(new Date(rule.lastExecutedAt), "d MMM yyyy HH:mm", { locale: es })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleToggle(rule.id)} title={rule.isActive ? "Desactivar" : "Activar"}>
                      <Power className={`h-4 w-4 ${rule.isActive ? "text-green-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleExecute(rule.id)} title="Ejecutar ahora" disabled={executeRule.isPending}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)}>
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
                          <AlertDialogTitle>¿Eliminar regla?</AlertDialogTitle>
                          <AlertDialogDescription>Se eliminarán los logs asociados.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(rule.id)} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No hay reglas de automatizacion.</p>
        </div>
      )}

      {showLogs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Logs de Automatizacion Recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs && logs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Regla</TableHead>
                    <TableHead>Suscriptor</TableHead>
                    <TableHead>Accion</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.ruleName}</TableCell>
                      <TableCell>{log.subscriberEmail || "-"}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{log.action}</TableCell>
                      <TableCell>
                        <Badge variant={log.status === "success" ? "default" : log.status === "failed" ? "destructive" : "secondary"}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(log.executedAt), "d MMM HH:mm", { locale: es })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-4">No hay logs recientes.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

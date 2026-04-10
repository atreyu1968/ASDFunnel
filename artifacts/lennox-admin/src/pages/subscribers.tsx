import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useListSubscribers,
  getListSubscribersQueryKey,
  useCreateSubscriber,
  useUpdateSubscriber,
  useDeleteSubscriber,
  useListMailingLists,
  getListMailingListsQueryKey,
  useGetSubscriberStats,
  getGetSubscriberStatsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Plus, Trash2, UserCheck, UserX, AlertTriangle, Users, TrendingUp } from "lucide-react";
import type { UpdateSubscriberBodyStatus } from "@workspace/api-client-react";

const subscriberSchema = z.object({
  email: z.string().email("El email es requerido"),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  language: z.string().min(1, "El idioma es requerido"),
  source: z.enum(["lead_magnet", "landing_page", "manual", "import"]),
  mailingListId: z.coerce.number().min(1, "La lista es requerida"),
  tags: z.string().optional().nullable(),
});

type SubscriberFormValues = z.infer<typeof subscriberSchema>;

const sourceLabels: Record<string, string> = {
  lead_magnet: "Lead Magnet",
  landing_page: "Landing Page",
  manual: "Manual",
  import: "Importación",
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  active: { label: "Activo", variant: "default" },
  unsubscribed: { label: "Dado de baja", variant: "secondary" },
  bounced: { label: "Rebotado", variant: "destructive" },
};

export default function Subscribers() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterList, setFilterList] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listParams: Record<string, number | string | undefined> = {};
  if (filterList !== "all") listParams.mailingListId = Number(filterList);
  if (filterStatus !== "all") listParams.status = filterStatus;
  if (filterSource !== "all") listParams.source = filterSource;

  const { data: subscribers, isLoading } = useListSubscribers(
    listParams,
    { query: { queryKey: getListSubscribersQueryKey(listParams) } }
  );

  const { data: mailingLists } = useListMailingLists(undefined, { query: { queryKey: getListMailingListsQueryKey() } });
  const { data: stats } = useGetSubscriberStats({ query: { queryKey: getGetSubscriberStatsQueryKey() } });

  const createSubscriber = useCreateSubscriber();
  const updateSubscriber = useUpdateSubscriber();
  const deleteSubscriber = useDeleteSubscriber();

  const form = useForm<SubscriberFormValues>({
    resolver: zodResolver(subscriberSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      language: "es",
      source: "manual",
      mailingListId: 0,
      tags: "",
    },
  });

  const onSubmit = (data: SubscriberFormValues) => {
    createSubscriber.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSubscribersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMailingListsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSubscriberStatsQueryKey() });
        toast({ title: "Suscriptor agregado exitosamente" });
        setIsCreateOpen(false);
        form.reset();
      },
      onError: () => {
        toast({ title: "Error al agregar suscriptor", variant: "destructive" });
      }
    });
  };

  const handleStatusChange = (id: number, newStatus: UpdateSubscriberBodyStatus) => {
    updateSubscriber.mutate({ id, data: { status: newStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSubscribersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMailingListsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSubscriberStatsQueryKey() });
        toast({ title: `Suscriptor ${newStatus === "unsubscribed" ? "dado de baja" : "actualizado"}` });
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteSubscriber.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSubscribersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMailingListsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSubscriberStatsQueryKey() });
        toast({ title: "Suscriptor eliminado" });
      },
    });
  };

  const filteredSubscribers = subscribers?.filter(s =>
    !searchTerm || s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Suscriptores</h2>
          <p className="text-muted-foreground">Gestión de la base de datos de emails captados.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) form.reset();
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-subscriber"><Plus className="mr-2 h-4 w-4" /> Agregar Suscriptor</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Agregar Suscriptor</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input placeholder="email@ejemplo.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre" {...field} value={field.value || ""} data-testid="input-first-name" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Apellido</FormLabel>
                        <FormControl>
                          <Input placeholder="Apellido" {...field} value={field.value || ""} data-testid="input-last-name" />
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
                        <FormLabel>Lista *</FormLabel>
                        <Select onValueChange={field.onChange} value={String(field.value || "")}>
                          <FormControl>
                            <SelectTrigger data-testid="select-mailing-list">
                              <SelectValue placeholder="Seleccionar lista" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {mailingLists?.map(l => (
                              <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
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
                            <SelectTrigger data-testid="select-sub-language">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="es">Español</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="fr">Français</SelectItem>
                            <SelectItem value="de">Deutsch</SelectItem>
                            <SelectItem value="pt">Português</SelectItem>
                            <SelectItem value="it">Italiano</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuente</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-source">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="lead_magnet">Lead Magnet</SelectItem>
                          <SelectItem value="landing_page">Landing Page</SelectItem>
                          <SelectItem value="import">Importación</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etiquetas</FormLabel>
                      <FormControl>
                        <Input placeholder="thriller, precuela, vip" {...field} value={field.value || ""} data-testid="input-tags" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createSubscriber.isPending} data-testid="button-submit-subscriber">
                    Agregar Suscriptor
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
              <CardTitle className="text-sm font-medium">Activos</CardTitle>
              <UserCheck className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500" data-testid="text-active-count">{stats.activeSubscribers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bajas</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-unsub-count">{stats.unsubscribed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rebotados</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive" data-testid="text-bounced-count">{stats.bounced}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Crecimiento</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {stats.growthByMonth.slice(-3).map((item) => (
                  <div key={item.month} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.month}</span>
                    <span className="font-medium">+{item.count}</span>
                  </div>
                ))}
                {stats.growthByMonth.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin datos</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Buscar por email o nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64"
          data-testid="input-search"
        />
        <Select value={filterList} onValueChange={setFilterList}>
          <SelectTrigger className="w-48" data-testid="filter-list">
            <SelectValue placeholder="Todas las listas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las listas</SelectItem>
            {mailingLists?.map(l => (
              <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40" data-testid="filter-status">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="unsubscribed">Dados de baja</SelectItem>
            <SelectItem value="bounced">Rebotados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-40" data-testid="filter-source">
            <SelectValue placeholder="Todas las fuentes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="lead_magnet">Lead Magnet</SelectItem>
            <SelectItem value="landing_page">Landing Page</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="import">Importación</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filteredSubscribers && filteredSubscribers.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Lista</TableHead>
                  <TableHead>Idioma</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscribers.map((sub) => {
                  const statusInfo = statusConfig[sub.status] || statusConfig.active;
                  return (
                    <TableRow key={sub.id} data-testid={`row-sub-${sub.id}`}>
                      <TableCell className="font-medium">{sub.email}</TableCell>
                      <TableCell>{[sub.firstName, sub.lastName].filter(Boolean).join(" ") || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{sub.mailingListName}</TableCell>
                      <TableCell><Badge variant="outline" className="uppercase text-xs">{sub.language}</Badge></TableCell>
                      <TableCell className="text-sm">{sourceLabels[sub.source] || sub.source}</TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(sub.subscribedAt), "dd MMM yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {sub.status === "active" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleStatusChange(sub.id, "unsubscribed")}
                              title="Dar de baja"
                              data-testid={`button-unsub-${sub.id}`}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                          {sub.status === "unsubscribed" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleStatusChange(sub.id, "active")}
                              title="Reactivar"
                              data-testid={`button-reactivate-${sub.id}`}
                            >
                              <UserCheck className="h-4 w-4" />
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-sub-${sub.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar suscriptor?</AlertDialogTitle>
                                <AlertDialogDescription>Se eliminará permanentemente {sub.email}.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(sub.id)} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No hay suscriptores registrados.</p>
        </div>
      )}
    </div>
  );
}

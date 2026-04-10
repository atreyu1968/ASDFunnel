import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetEmailSettings,
  getGetEmailSettingsQueryKey,
  useUpdateEmailSettings,
  useTestEmailSettings,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Settings, Mail, CheckCircle, XCircle, Send, Shield, Loader2 } from "lucide-react";

const settingsSchema = z.object({
  apiKey: z.string().min(1, "La API key es requerida"),
  fromEmail: z.string().email("Email inválido"),
  fromName: z.string().min(1, "El nombre del remitente es requerido"),
  replyToEmail: z.string().email("Email inválido").or(z.literal("")).optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const { data: settings, isLoading } = useGetEmailSettings();
  const updateMutation = useUpdateEmailSettings();
  const testMutation = useTestEmailSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: {
      apiKey: "",
      fromEmail: settings?.fromEmail ?? "",
      fromName: settings?.fromName ?? "",
      replyToEmail: settings?.replyToEmail ?? "",
    },
  });

  const onSubmit = async (values: SettingsFormValues) => {
    try {
      await updateMutation.mutateAsync({
        data: {
          provider: "resend",
          apiKey: values.apiKey,
          fromEmail: values.fromEmail,
          fromName: values.fromName,
          replyToEmail: values.replyToEmail || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetEmailSettingsQueryKey() });
      form.setValue("apiKey", "");
      toast({
        title: "Configuración guardada",
        description: "La configuración de email se actualizó correctamente.",
      });
    } catch {
      toast({
        title: "Error",
        description: "No se pudo guardar la configuración.",
        variant: "destructive",
      });
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;
    setIsTesting(true);
    try {
      const result = await testMutation.mutateAsync({ data: { toEmail: testEmail } });
      toast({
        title: result.success ? "Email enviado" : "Error al enviar",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({
        title: "Error",
        description: "No se pudo enviar el email de prueba.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Settings className="h-8 w-8 text-primary" />
            Configuración
          </h1>
          <p className="text-muted-foreground mt-1">
            Configura el proveedor de email para enviar correos automáticos
          </p>
        </div>
        <Badge
          variant={settings?.isConfigured ? "default" : "destructive"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
        >
          {settings?.isConfigured ? (
            <>
              <CheckCircle className="h-3.5 w-3.5" />
              Configurado
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5" />
              Sin configurar
            </>
          )}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Proveedor: Resend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>API Key de Resend</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder={settings?.apiKey ? `Actual: ${settings.apiKey}` : "re_xxxxxxxxxxxxxxxxxxxxxxxxxx"}
                            className="font-mono"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Obtén tu API key en{" "}
                          <a
                            href="https://resend.com/api-keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            resend.com/api-keys
                          </a>
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fromEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email remitente</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="noreply@tueditorial.com" />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Debe estar verificado en Resend
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fromName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del remitente</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Lennox Hale Publishing" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="replyToEmail"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Email de respuesta (opcional)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="contacto@tueditorial.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="w-full md:w-auto"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  Guardar configuración
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Enviar email de prueba
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Verifica que tu configuración funciona enviando un email de prueba.
            </p>
            <Input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="tu@email.com"
              type="email"
              disabled={!settings?.isConfigured}
            />
            <Button
              onClick={handleTestEmail}
              disabled={!settings?.isConfigured || !testEmail || isTesting}
              variant="outline"
              className="w-full"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Enviar prueba
            </Button>
            {!settings?.isConfigured && (
              <p className="text-xs text-amber-400">
                Primero configura y guarda tu API key para poder enviar emails de prueba.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Estado del servicio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Proveedor</span>
              <span className="text-sm font-medium">Resend</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Email remitente</span>
              <span className="text-sm font-medium">{settings?.fromEmail ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Nombre remitente</span>
              <span className="text-sm font-medium">{settings?.fromName ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">API Key</span>
              <span className="text-sm font-medium">{settings?.apiKey ? "Configurada" : "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Última actualización</span>
              <span className="text-sm font-medium">
                {settings?.updatedAt
                  ? new Date(settings.updatedAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

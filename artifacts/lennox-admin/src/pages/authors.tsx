import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  useListAuthors,
  getListAuthorsQueryKey,
  useCreateAuthor,
  useUpdateAuthor,
  useDeleteAuthor
} from "@workspace/api-client-react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2 } from "lucide-react";

const authorSchema = z.object({
  penName: z.string().min(1, "El pseudónimo es requerido"),
  realName: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  genreFocus: z.string().optional().nullable(),
  brandDescription: z.string().optional().nullable(),
  domain: z.string().optional().nullable(),
});

type AuthorFormValues = z.infer<typeof authorSchema>;

export default function Authors() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAuthorId, setEditingAuthorId] = useState<number | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: authors, isLoading } = useListAuthors({
    query: { queryKey: getListAuthorsQueryKey() }
  });

  const createAuthor = useCreateAuthor();
  const updateAuthor = useUpdateAuthor();
  const deleteAuthor = useDeleteAuthor();

  const form = useForm<AuthorFormValues>({
    resolver: zodResolver(authorSchema),
    defaultValues: {
      penName: "",
      realName: "",
      bio: "",
      genreFocus: "",
      brandDescription: "",
    },
  });

  const onSubmit = (data: AuthorFormValues) => {
    if (editingAuthorId) {
      updateAuthor.mutate({ id: editingAuthorId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAuthorsQueryKey() });
          toast({ title: "Autor actualizado exitosamente" });
          setIsCreateOpen(false);
          setEditingAuthorId(null);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al actualizar autor", variant: "destructive" });
        }
      });
    } else {
      createAuthor.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAuthorsQueryKey() });
          toast({ title: "Autor creado exitosamente" });
          setIsCreateOpen(false);
          form.reset();
        },
        onError: () => {
          toast({ title: "Error al crear autor", variant: "destructive" });
        }
      });
    }
  };

  const handleEdit = (author: any) => {
    setEditingAuthorId(author.id);
    form.reset({
      penName: author.penName,
      realName: author.realName || "",
      bio: author.bio || "",
      genreFocus: author.genreFocus || "",
      brandDescription: author.brandDescription || "",
    });
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteAuthor.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAuthorsQueryKey() });
        toast({ title: "Autor eliminado" });
      },
      onError: () => {
        toast({ title: "Error al eliminar autor", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Autores</h2>
          <p className="text-muted-foreground">Gestión de pseudónimos y perfiles de marca.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setEditingAuthorId(null);
            form.reset({
              penName: "",
              realName: "",
              bio: "",
              genreFocus: "",
              brandDescription: "",
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Autor</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{editingAuthorId ? "Editar Autor" : "Crear Autor"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="penName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pseudónimo *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej. L.H. Thriller" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="realName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre Real (Interno)</FormLabel>
                        <FormControl>
                          <Input placeholder="Nombre del escritor fantasma" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="genreFocus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Foco de Género</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Thriller Psicológico" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brandDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción de la Marca</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Voz, tono, y audiencia objetivo" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Biografía Pública</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Biografía para tiendas y website" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dominio del Autor</FormLabel>
                      <FormControl>
                        <Input placeholder="lennoxhale.com" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createAuthor.isPending || updateAuthor.isPending}>
                    {editingAuthorId ? "Guardar Cambios" : "Crear Autor"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : authors && authors.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {authors.map((author) => (
            <Card key={author.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{author.penName}</CardTitle>
                    <CardDescription>{author.genreFocus || "Género no especificado"}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(author)}>
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
                          <AlertDialogTitle>¿Eliminar autor?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción no se puede deshacer. Los libros asociados podrían quedar huérfanos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDelete(author.id)}
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
              <CardContent className="flex-1">
                <div className="space-y-2 text-sm">
                  {author.realName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Real:</span>
                      <span className="font-medium">{author.realName}</span>
                    </div>
                  )}
                  {(author as any).domain && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dominio:</span>
                      <span className="font-medium text-primary">{(author as any).domain}</span>
                    </div>
                  )}
                  <div className="flex flex-col mt-2">
                    <span className="text-muted-foreground text-xs mb-1">Marca:</span>
                    <p className="line-clamp-3 text-xs bg-muted p-2 rounded-md">
                      {author.brandDescription || "Sin descripción"}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/50 px-6 py-3">
                <div className="text-xs text-muted-foreground w-full text-right">
                  Creado {format(new Date(author.createdAt), "MMM yyyy", { locale: es })}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <p className="text-muted-foreground">No hay autores registrados.</p>
        </div>
      )}
    </div>
  );
}

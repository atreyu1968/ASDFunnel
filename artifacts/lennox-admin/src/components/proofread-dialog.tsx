import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SpellCheck, FileText, Edit2, Loader2, Copy, Check } from "lucide-react";
import { aiProofread } from "@/lib/ai-api";

type ProofreadResult = {
  correctedText: string;
  changes: string[];
  blocksProcessed: number;
  originalLength: number;
  correctedLength: number;
  glitches?: { block: number; type: string; description: string; original: string; fixed: string }[];
  stats?: { totalGlitches: number; criticalGlitches: number; typographicFixes: number };
};

const CRITICAL_TYPES = ["solapamiento_dialogo","corte_frase","bucle_accion","parrafo_clonado","cambio_perspectiva","ruptura_temporal","personaje_fantasma"];
const MEDIUM_TYPES = ["muletilla_ia","sobre_explicacion","transicion_artificial","dialogo_informativo"];

function getGlitchColor(type: string) {
  if (CRITICAL_TYPES.includes(type)) return { border: "rgb(239 68 68 / 0.5)", badge: "bg-red-500/20 text-red-400 border-red-500/30" };
  if (MEDIUM_TYPES.includes(type)) return { border: "rgb(245 158 11 / 0.5)", badge: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
  return { border: "rgb(59 130 246 / 0.5)", badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
}

interface ProofreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId?: number | null;
  bookTitle?: string;
  hasManuscript?: boolean;
  initialText?: string;
  showManuscriptMode?: boolean;
  onToast: (opts: { title: string; description?: string; variant?: "destructive" | "default" }) => void;
}

export function ProofreadDialog({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  hasManuscript,
  initialText = "",
  showManuscriptMode = false,
  onToast,
}: ProofreadDialogProps) {
  const [mode, setMode] = useState<"manuscript" | "text">(showManuscriptMode && hasManuscript ? "manuscript" : "text");
  const [text, setText] = useState(initialText);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = (o: boolean) => {
    onOpenChange(o);
    if (!o) { setResult(null); setText(initialText); }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const params: { bookId?: number; text?: string } = {};
      if (mode === "manuscript" && bookId) {
        params.bookId = bookId;
      } else if (mode === "text" && text.trim()) {
        params.text = text;
        if (bookId) params.bookId = bookId;
      } else {
        onToast({ title: "Error", description: "Selecciona un manuscrito o pega el texto a corregir", variant: "destructive" });
        setLoading(false);
        return;
      }
      const res = await aiProofread(params);
      setResult(res);
      onToast({ title: `Corrección completada (${res.blocksProcessed} bloques procesados)` });
    } catch (e: any) {
      onToast({ title: "Error al corregir", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SpellCheck className="h-5 w-5 text-primary" /> Corrector Ortotipográfico Senior
          </DialogTitle>
          <DialogDescription>
            Corrección profesional con detección de glitches de IA, errores ortotipográficos y preservación del estilo narrativo.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {showManuscriptMode && (
              <div className="flex gap-2">
                <Button variant={mode === "manuscript" ? "default" : "outline"} size="sm" onClick={() => setMode("manuscript")}>
                  <FileText className="h-4 w-4 mr-1" /> Manuscrito subido
                </Button>
                <Button variant={mode === "text" ? "default" : "outline"} size="sm" onClick={() => setMode("text")}>
                  <Edit2 className="h-4 w-4 mr-1" /> Pegar texto
                </Button>
              </div>
            )}

            {mode === "manuscript" && showManuscriptMode ? (
              <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Se usará el manuscrito (.docx) subido para este libro. El texto se extraerá automáticamente y se procesará bloque a bloque.
                </p>
                {bookTitle && (
                  <div className="text-sm">
                    <span className="font-medium">Libro: </span>{bookTitle}
                    {!hasManuscript && (
                      <p className="text-amber-500 mt-1">Este libro no tiene manuscrito subido. Sube un .docx primero o usa la opción "Pegar texto".</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Textarea
                placeholder="Pega aquí el texto a corregir (capítulo, fragmento, email, descripción de landing, etc.)..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[200px] font-mono text-xs"
              />
            )}

            <div className="p-3 rounded-lg border bg-muted/20 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Auditoría de 14 fases — El corrector detectará:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span className="text-red-400">● Solapamientos de diálogo</span>
                <span className="text-red-400">● Cortes a mitad de frase</span>
                <span className="text-red-400">● Bucles de acción/descripción</span>
                <span className="text-red-400">● Párrafos clonados</span>
                <span className="text-red-400">● Cambios de perspectiva/voz</span>
                <span className="text-red-400">● Rupturas de continuidad temporal</span>
                <span className="text-red-400">● Personajes fantasma</span>
                <span className="text-amber-400">● Muletillas y clichés de IA</span>
                <span className="text-amber-400">● Sobre-explicación emocional</span>
                <span className="text-amber-400">● Transiciones artificiales</span>
                <span className="text-amber-400">● Diálogos informativos</span>
                <span className="text-blue-400">● Ortotipografía RAE</span>
                <span className="text-blue-400">● Formato de diálogos</span>
                <span className="text-blue-400">● Coherencia léxica</span>
              </div>
              <p className="mt-1 text-amber-500">Regla de oro: preserva el estilo, tono y trama del autor.</p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading || (mode === "text" && text.trim().length < 50)}
              className="w-full"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Corrigiendo texto (puede tardar)...</>
              ) : (
                <><SpellCheck className="h-4 w-4 mr-2" /> Iniciar corrección</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
              <span>{result.blocksProcessed} bloques procesados</span>
              <span>{result.originalLength.toLocaleString()} → {result.correctedLength.toLocaleString()} caracteres</span>
              {result.stats && (
                <>
                  <span className={result.stats.criticalGlitches > 0 ? "text-red-400 font-medium" : "text-green-400"}>
                    {result.stats.criticalGlitches} glitches críticos
                  </span>
                  <span>{result.stats.typographicFixes} correcciones tipográficas</span>
                </>
              )}
            </div>

            {result.glitches && result.glitches.length > 0 && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                <span className="text-xs font-medium text-red-400 uppercase">Glitches detectados ({result.glitches.length})</span>
                <div className="mt-2 space-y-3 max-h-[200px] overflow-y-auto">
                  {result.glitches.map((g, i) => {
                    const color = getGlitchColor(g.type);
                    return (
                      <div key={i} className="text-xs border-l-2 pl-3 space-y-1" style={{ borderColor: color.border }}>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Badge className={`text-[10px] px-1.5 py-0 ${color.badge}`}>
                            {g.type.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-muted-foreground">Bloque {g.block}</span>
                        </div>
                        <p className="text-muted-foreground">{g.description}</p>
                        {g.original && (
                          <div className="bg-red-500/5 p-1.5 rounded text-red-300 line-through">{g.original}</div>
                        )}
                        {g.fixed && (
                          <div className="bg-green-500/5 p-1.5 rounded text-green-300">{g.fixed}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {result.changes.length > 0 && (
              <div className="p-3 rounded-lg border bg-amber-500/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-amber-500 uppercase">Detalle de cambios ({result.changes.length})</span>
                </div>
                <ul className="text-xs space-y-1 max-h-[150px] overflow-y-auto">
                  {result.changes.map((change, i) => (
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
                    navigator.clipboard.writeText(result.correctedText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <><Check className="h-3 w-3 mr-1 text-green-500" /> Copiado</> : <><Copy className="h-3 w-3 mr-1" /> Copiar todo</>}
                </Button>
              </div>
              <div className="text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto font-serif leading-relaxed">
                {result.correctedText}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setResult(null); setText(initialText); }} className="flex-1">
                Nueva corrección
              </Button>
              <Button variant="outline" onClick={() => handleClose(false)} className="flex-1">
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

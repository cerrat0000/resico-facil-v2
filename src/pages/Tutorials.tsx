import React, { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Play, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MANUAL_TUTORIALS = [
  {
    id: "1",
    title: "¿Qué es el RESICO? Guía Completa",
    description: "Aprende las bases del Régimen Simplificado de Confianza.",
    duration_minutes: 15,
    youtube_id: "TbBRSOJcvws",
  },
  {
    id: "2",
    title: "Cómo presentar tu Declaración Mensual",
    description: "Paso a paso para cumplir con tus obligaciones fiscales.",
    duration_minutes: 22,
    youtube_id: "WDt5QCQ3HOY",
  },
];

const Tutorials = () => {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [selectedTutorial, setSelectedTutorial] = useState<any>(null);
  const playerRef = useRef<any>(null);

  // 1. Cargar el script de la API de YouTube
  useEffect(() => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // Guardar el estado de completados desde localStorage (opcional)
    const saved = localStorage.getItem("completed_tutorials");
    if (saved) setCompletedIds(new Set(JSON.parse(saved)));
  }, []);

  const handleTutorialClick = (t: any) => {
    setSelectedTutorial(t);
  };

  // 2. Función que se ejecuta cuando el reproductor está listo
  const onPlayerReady = (event: any) => {
    // Aquí podrías intentar saltar al tiempo guardado si usaras una DB
    event.target.playVideo();
  };

  // 3. Función clave: Detecta cambios de estado (Play, Pausa, Terminado)
  const onPlayerStateChange = (event: any) => {
    // event.data === 0 significa que el video TERMINÓ
    if (event.data === 0 && selectedTutorial) {
      const newCompleted = new Set(completedIds).add(selectedTutorial.id);
      setCompletedIds(newCompleted);
      localStorage.setItem("completed_tutorials", JSON.stringify(Array.from(newCompleted)));
      toast.success("¡Tutorial completado con éxito!");
    }
  };

  // 4. Crear el reproductor cuando se abre el Dialog
  useEffect(() => {
    if (selectedTutorial && (window as any).YT) {
      // Pequeño timeout para asegurar que el div del modal ya exista en el DOM
      setTimeout(() => {
        playerRef.current = new (window as any).YT.Player("youtube-player", {
          height: "100%",
          width: "100%",
          videoId: selectedTutorial.youtube_id,
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
          },
        });
      }, 500);
    }
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [selectedTutorial]);

  const completed = completedIds.size;
  const total = MANUAL_TUTORIALS.length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold font-display">Aprende</h1>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium">Progreso general</p>
              <span className="text-sm font-bold text-primary">
                {completed}/{total}
              </span>
            </div>
            <Progress value={progress} className="h-3" />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {MANUAL_TUTORIALS.map((t) => {
            const isDone = completedIds.has(t.id);
            return (
              <Card
                key={t.id}
                className="cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => handleTutorialClick(t)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isDone ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {isDone ? <CheckCircle2 size={18} /> : <Play size={18} />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={12} /> {t.duration_minutes} min
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Dialog open={!!selectedTutorial} onOpenChange={(open) => !open && setSelectedTutorial(null)}>
          <DialogContent className="sm:max-w-4xl p-0 overflow-hidden bg-black border-none">
            <DialogHeader className="p-4 bg-white">
              <DialogTitle className="text-base font-bold">Viendo tutorial obligatorio</DialogTitle>
            </DialogHeader>
            <div className="aspect-video w-full">
              {/* Contenedor donde la API de YouTube inyectará el video */}
              <div id="youtube-player"></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Tutorials;

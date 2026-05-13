import React from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, History } from "lucide-react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";

export const NotificationPopover = () => {
  const { data: logs, isLoading } = useAuditLogs();
  const navigate = useNavigate();
  const unreadCount = (logs || []).length; // Por ahora consideramos todos como nuevos para demo

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full border-2 border-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b flex items-center justify-between">
          <h4 className="font-semibold text-sm">Notificaciones</h4>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[10px] h-auto p-0"
            onClick={() => navigate('/actividad-fiscal')}
          >
            Ver todo
          </Button>
        </div>
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Cargando...</div>
          ) : !logs || logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground italic">
              No tienes notificaciones pendientes.
            </div>
          ) : (
            <div className="flex flex-col">
              {logs.slice(0, 10).map((log) => (
                <div 
                  key={log.id} 
                  className="p-3 border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate('/actividad-fiscal')}
                >
                  <p className="text-xs">
                    <span className="font-bold">{log.actorName}</span> {log.friendlyMessage}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: es })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t bg-muted/20">
          <Button 
            variant="ghost" 
            className="w-full text-xs h-8" 
            onClick={() => navigate('/actividad-fiscal')}
          >
            Ver historial completo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

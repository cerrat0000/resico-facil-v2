import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuditLogs, AuditLogEntry } from '@/hooks/useAuditLogs';
import { 
  History, User, Clock, FileText, 
  TrendingUp, TrendingDown, Trash2, 
  CheckCircle2, Download, Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

const ActionIcon = ({ action }: { action: string }) => {
  if (action.includes('income')) return <TrendingUp className="text-green-500" size={16} />;
  if (action.includes('expense')) return <TrendingDown className="text-red-500" size={16} />;
  if (action.includes('delete')) return <Trash2 className="text-muted-foreground" size={16} />;
  if (action.includes('declaration')) return <FileText className="text-primary" size={16} />;
  if (action.includes('finalize')) return <CheckCircle2 className="text-green-600" size={16} />;
  if (action.includes('pdf')) return <Download className="text-blue-500" size={16} />;
  return <History size={16} />;
};

const FiscalActivity = () => {
  const { data: logs, isLoading } = useAuditLogs();

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <History size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Actividad Fiscal</h1>
            <p className="text-muted-foreground text-sm">Historial de acciones realizadas en tu cuenta.</p>
          </div>
        </div>

        <Card className="border-none shadow-sm bg-gradient-to-b from-background to-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Clock size={18} className="text-primary" /> Historial Reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 relative">
            {/* Vertical Line */}
            <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-muted-foreground/10 z-0" />

            {isLoading ? (
              <div className="space-y-6 py-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !logs || logs.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Shield size={20} className="text-muted-foreground opacity-50" />
                </div>
                <p className="text-sm text-muted-foreground">No hay actividad reciente registrada.</p>
              </div>
            ) : (
              <div className="space-y-8 py-4">
                {logs.map((log: AuditLogEntry) => (
                  <div key={log.id} className="relative z-10 flex gap-4 group">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 shadow-sm border bg-background transition-transform group-hover:scale-110`}>
                      <ActionIcon action={log.action} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-medium leading-none">
                          <span className="text-primary font-bold">{log.actorName}</span> {log.friendlyMessage}
                        </p>
                        <time className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">
                          {format(new Date(log.createdAt), "dd MMM, HH:mm", { locale: es })}
                        </time>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User size={12} /> {log.actorRole === 'accountant' ? 'Contador Responsable' : 'Contribuyente'}
                        </span>
                        {log.isProxy && (
                          <Badge variant="outline" className="text-[9px] h-4 bg-amber-50 text-amber-600 border-amber-200">
                            Modo Proxy
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default FiscalActivity;

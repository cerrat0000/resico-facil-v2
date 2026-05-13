import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminAudit, useAdminAuditStats } from '@/hooks/useAdminAudit';
import { 
  ShieldAlert, Search, Filter, 
  Activity, FileCheck, Download, 
  Calendar, UserSearch, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const AdminAudit = () => {
  const [filter, setFilter] = useState({ userId: '', action: '', startDate: '', endDate: '' });
  const { data: logs, isLoading } = useAdminAudit(filter);
  const { data: stats } = useAdminAuditStats();

  const getSeverity = (action: string) => {
    if (action.includes('delete')) return 'destructive';
    if (action.includes('finalize')) return 'default';
    if (action.includes('create')) return 'outline';
    return 'secondary';
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-destructive/10 text-destructive">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">Panel de Auditoría Admin</h1>
              <p className="text-muted-foreground text-sm">Control total de acciones y trazabilidad del sistema.</p>
            </div>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            <Card className="min-w-[120px] shadow-sm">
              <CardContent className="p-3 flex flex-col items-center">
                <span className="text-xs text-muted-foreground">Acciones Hoy</span>
                <span className="text-xl font-bold text-primary">{stats?.actionsToday || 0}</span>
              </CardContent>
            </Card>
            <Card className="min-w-[120px] shadow-sm">
              <CardContent className="p-3 flex flex-col items-center">
                <span className="text-xs text-muted-foreground">PDFs Gen</span>
                <span className="text-xl font-bold text-blue-600">{stats?.pdfsGenerated || 0}</span>
              </CardContent>
            </Card>
            <Card className="min-w-[120px] shadow-sm">
              <CardContent className="p-3 flex flex-col items-center">
                <span className="text-xs text-muted-foreground">Declaraciones</span>
                <span className="text-xl font-bold text-green-600">{stats?.declarationsFinalized || 0}</span>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative">
                <UserSearch className="absolute left-3 top-3 text-muted-foreground" size={16} />
                <Input 
                  placeholder="ID Usuario" 
                  className="pl-9" 
                  value={filter.userId}
                  onChange={e => setFilter(prev => ({ ...prev, userId: e.target.value }))}
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-3 text-muted-foreground" size={16} />
                <Input 
                  placeholder="Acción (ej: delete)" 
                  className="pl-9" 
                  value={filter.action}
                  onChange={e => setFilter(prev => ({ ...prev, action: e.target.value }))}
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 text-muted-foreground" size={16} />
                <Input 
                  type="date" 
                  className="pl-9" 
                  value={filter.startDate}
                  onChange={e => setFilter(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <Button variant="secondary" className="w-full" onClick={() => setFilter({ userId: '', action: '', startDate: '', endDate: '' })}>
                Limpiar Filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="border-none shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                <tr>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Tabla / ID</th>
                  <th className="px-4 py-3 text-right">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={4} className="px-4 py-4"><div className="h-4 bg-muted rounded w-full" /></td>
                    </tr>
                  ))
                ) : logs?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No se encontraron registros de auditoría con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  logs?.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-[10px] text-muted-foreground">{log.user_id?.slice(0, 8)}...</span>
                          <span className="text-xs font-semibold">Actor ID</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverity(log.action)} className="text-[10px] font-mono">
                            {log.action}
                          </Badge>
                          {log.action.includes('delete') && <AlertTriangle size={12} className="text-destructive" />}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground uppercase">{log.table_name || 'N/A'}</span>
                          <span className="text-xs font-mono">{log.record_id?.slice(0, 12) || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <time className="text-xs font-mono">
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm")}
                        </time>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminAudit;

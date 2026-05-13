import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, FolderOpen,
  FileText, Plus, ArrowRight, AlertCircle, CheckCircle2
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import AccountantInvitations from '@/components/AccountantInvitations';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useUserRole } from '@/hooks/useUserRole';

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const StatCard: React.FC<{
  title: string; value: string; subtitle?: string;
  icon: React.ReactNode; variant?: 'default' | 'success' | 'warning';
  loading?: boolean;
}> = ({ title, value, subtitle, icon, variant = 'default', loading }) => (
  <Card className="animate-fade-in">
    <CardContent className="p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${
        variant === 'success' ? 'bg-accent text-accent-foreground' :
        variant === 'warning' ? 'bg-warning/10 text-warning' :
        'bg-muted text-muted-foreground'
      }`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{title}</p>
        {loading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <p className="text-lg font-bold font-display">{value}</p>
        )}
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useDashboardStats();
  const { data: role } = useUserRole();
  const displayName = user?.user_metadata?.full_name?.split(' ')[0] || 'Usuario';
  const currentMonth = new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  React.useEffect(() => {
    if (role === 'accountant') navigate('/contador', { replace: true });
  }, [role, navigate]);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">¡Hola, {displayName}!</h1>
          <p className="text-muted-foreground text-sm capitalize">{currentMonth}</p>
        </div>

        <AccountantInvitations />

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="Ingresos del mes"
            value={fmt(data?.monthIncome ?? 0)}
            icon={<TrendingUp size={18} />}
            variant="success"
            loading={isLoading}
          />
          <StatCard
            title="Gastos del mes"
            value={fmt(data?.monthExpenses ?? 0)}
            icon={<TrendingDown size={18} />}
            loading={isLoading}
          />
          <StatCard
            title="Expediente"
            value={`${data?.profileCompletion ?? 0}%`}
            subtitle="Perfil fiscal"
            icon={<FolderOpen size={18} />}
            variant={data && data.profileCompletion === 100 ? 'success' : 'warning'}
            loading={isLoading}
          />
          <StatCard
            title="Declaraciones"
            value={`${data?.pendingDeclarations ?? 0}`}
            subtitle="Pendientes"
            icon={<FileText size={18} />}
            loading={isLoading}
          />
        </div>

        {!isLoading && data && data.profileCompletion < 100 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Completa tu perfil fiscal</p>
                <span className="text-sm font-bold text-primary">{data.profileCompletion}%</span>
              </div>
              <Progress value={data.profileCompletion} className="h-2" />
              <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => navigate('/settings')}>
                Ir a Ajustes <ArrowRight size={14} className="ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start h-12 text-left" onClick={() => navigate('/income-expenses')}>
              <Plus size={18} className="mr-2 text-primary shrink-0" />
              <span>Registra tu venta o gasto</span>
              <ArrowRight size={16} className="ml-auto text-muted-foreground" />
            </Button>
            <Button variant="outline" className="w-full justify-start h-12 text-left" onClick={() => navigate('/documents')}>
              <FolderOpen size={18} className="mr-2 text-primary shrink-0" />
              <span>Sube un documento</span>
              <ArrowRight size={16} className="ml-auto text-muted-foreground" />
            </Button>
            <Button variant="outline" className="w-full justify-start h-12 text-left" onClick={() => navigate('/declarations')}>
              <FileText size={18} className="mr-2 text-primary shrink-0" />
              <span>Prepara tu declaración</span>
              <ArrowRight size={16} className="ml-auto text-muted-foreground" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Pendientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isLoading && data?.profileCompletion !== 100 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Completa tu perfil fiscal</p>
                  <p className="text-xs text-muted-foreground">Agrega tu RFC y datos fiscales en Ajustes.</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
              <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Registra tus movimientos del día</p>
                <p className="text-xs text-muted-foreground">Mantén tus registros al día para tu declaración.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Dashboard;

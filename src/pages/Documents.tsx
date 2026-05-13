import React, { useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, FileText, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface DocType {
  id: string; code: string; name: string; description: string | null; is_required: boolean;
}
interface DocItem {
  id: string; file_name: string; file_url: string;
  document_type_id: string | null; verification_status: string;
  mime_type: string | null; created_at: string;
}

const BUCKET = 'taxpayer-documents';

const Documents = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const typesQ = useQuery({
    queryKey: ['document_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_types').select('*').order('is_required', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocType[];
    },
  });

  const docsQ = useQuery({
    queryKey: ['documents', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, file_name, file_url, document_type_id, verification_status, mime_type, created_at')
        .eq('user_id', user!.id).eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocItem[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('No user');
      if (file.size > 10 * 1024 * 1024) throw new Error('El archivo debe pesar menos de 10 MB');
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      const { data, error: insErr } = await supabase.from('documents').insert({
        user_id: user.id, file_name: file.name, file_url: path,
        document_type_id: selectedTypeId || null, mime_type: file.type,
        file_size: file.size, verification_status: 'pending', status: 'active',
      }).select('id').single();
      if (insErr) throw insErr;
      await supabase.from('audit_logs').insert({
        user_id: user.id, action: 'document.upload',
        table_name: 'documents', record_id: data.id,
        new_data: { file_name: file.name, document_type_id: selectedTypeId || null },
      });
    },
    onSuccess: () => {
      toast.success('Documento subido correctamente');
      setDialogOpen(false);
      setSelectedTypeId('');
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['documents', user?.id] });
    },
    onError: (e: any) => toast.error(`Error al subir: ${e.message}`),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
  };

  const openSigned = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) { toast.error('No se pudo abrir el archivo'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const docTypes = typesQ.data ?? [];
  const docs = docsQ.data ?? [];
  const loading = typesQ.isLoading || docsQ.isLoading;

  const requiredTypes = docTypes.filter((t) => t.is_required);
  const uploadedRequired = requiredTypes.filter((t) =>
    docs.some((d) => d.document_type_id === t.id),
  ).length;
  const completeness = requiredTypes.length
    ? Math.round((uploadedRequired / requiredTypes.length) * 100) : 0;

  const statusBadge = (s: string) => {
    if (s === 'verified') return <Badge className="bg-success text-success-foreground text-xs">Verificado</Badge>;
    if (s === 'rejected') return <Badge variant="destructive" className="text-xs">Rechazado</Badge>;
    return <Badge variant="secondary" className="text-xs">Pendiente</Badge>;
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-display">Expediente Digital</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg"><Upload size={16} /> Subir documento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Subir nuevo documento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de documento</Label>
                  <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
                    <SelectContent>
                      {docTypes.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Archivo (imagen o PDF, máx 10 MB)</Label>
                  <Input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} disabled={upload.isPending} />
                </div>
                {upload.isPending && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Subiendo archivo...
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium">Completitud del expediente</p>
              <span className="text-sm font-bold text-primary">{completeness}%</span>
            </div>
            <Progress value={completeness} className="h-3" />
            <p className="text-xs text-muted-foreground">
              {uploadedRequired} de {requiredTypes.length} documentos requeridos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Documentos requeridos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : (
              requiredTypes.map((t) => {
                const uploaded = docs.find((d) => d.document_type_id === t.id);
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                    <div className={`p-2 rounded-lg ${uploaded ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {uploaded ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    </div>
                    {uploaded ? statusBadge(uploaded.verification_status) : (
                      <Button variant="outline" size="sm" onClick={() => { setSelectedTypeId(t.id); setDialogOpen(true); }}>
                        Subir
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Todos los documentos</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : docs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aún no has subido documentos</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="p-2 rounded-lg bg-muted">
                      {doc.mime_type?.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                    {statusBadge(doc.verification_status)}
                    <Button variant="ghost" size="icon" onClick={() => openSigned(doc.file_url)} aria-label="Ver">
                      <Eye size={16} />
                    </Button>
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

export default Documents;

import React, { useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface DocType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_required: boolean;
}

interface DocItem {
  id: string;
  file_name: string;
  file_url: string;
  document_type_id: string | null;
  verification_status: string;
  mime_type: string | null;
  created_at: string;
}

const BUCKET = 'taxpayer-documents';

const Documents = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [docsDialogOpen, setDocsDialogOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const fileRef = useRef<HTMLInputElement>(null);

  const typesQ = useQuery({
    queryKey: ['document_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_types')
        .select('*')
        .order('is_required', { ascending: false });

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
        .select(
          'id, file_name, file_url, document_type_id, verification_status, mime_type, created_at',
        )
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as DocItem[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('No user');

      if (file.size > 10 * 1024 * 1024) {
        throw new Error('El archivo debe pesar menos de 10 MB');
      }

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx'];
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (!ext || !allowedExtensions.includes(ext)) {
        throw new Error('Solo se permiten imágenes, PDF, DOC o DOCX');
      }

      if (file.type && !allowedTypes.includes(file.type)) {
        throw new Error('Tipo de archivo no permitido');
      }

      const path = `${user.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

      if (upErr) throw upErr;

      const { data, error: insErr } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_url: path,
          document_type_id: selectedTypeId || null,
          mime_type: file.type || null,
          file_size: file.size,

          // Si tu base de datos no acepta "uploaded", cámbialo por "pending".
          // Visualmente ya aparecerá como "Subido".
          verification_status: 'uploaded',

          status: 'active',
        })
        .select('id')
        .single();

      if (insErr) throw insErr;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'document.upload',
        table_name: 'documents',
        record_id: data.id,
        new_data: {
          file_name: file.name,
          document_type_id: selectedTypeId || null,
        },
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

  const deleteDoc = useMutation({
    mutationFn: async (doc: DocItem) => {
      if (!user) throw new Error('No user');

      await supabase.storage.from(BUCKET).remove([doc.file_url]);

      const { error } = await supabase
        .from('documents')
        .update({
          status: 'deleted',
        })
        .eq('id', doc.id)
        .eq('user_id', user.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'document.delete',
        table_name: 'documents',
        record_id: doc.id,
        old_data: {
          file_name: doc.file_name,
          file_url: doc.file_url,
        },
      });
    },
    onSuccess: () => {
      toast.success('Documento eliminado');

      if (previewDoc) {
        setPreviewDoc(null);
        setPreviewUrl('');
      }

      qc.invalidateQueries({ queryKey: ['documents', user?.id] });
    },
    onError: (e: any) => toast.error(`Error al eliminar: ${e.message}`),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
  };

  const getSignedUrl = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);

    if (error || !data?.signedUrl) {
      throw new Error('No se pudo abrir el archivo');
    }

    return data.signedUrl;
  };

  const viewDocument = async (doc: DocItem) => {
    try {
      const signedUrl = await getSignedUrl(doc.file_url);
      setPreviewDoc(doc);
      setPreviewUrl(signedUrl);
      setDocsDialogOpen(true);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo abrir el archivo');
    }
  };

  const openInNewTab = async (doc: DocItem) => {
    try {
      const signedUrl = await getSignedUrl(doc.file_url);
      window.open(signedUrl, '_blank');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo abrir el archivo');
    }
  };

  const docTypes = typesQ.data ?? [];
  const docs = docsQ.data ?? [];
  const loading = typesQ.isLoading || docsQ.isLoading;

  const requiredTypes = docTypes.filter((t) => t.is_required);

  const uploadedRequired = requiredTypes.filter((t) =>
    docs.some((d) => d.document_type_id === t.id),
  ).length;

  const completeness = requiredTypes.length
    ? Math.round((uploadedRequired / requiredTypes.length) * 100)
    : 0;

  const getDocTypeName = (documentTypeId: string | null) => {
    if (!documentTypeId) return 'Sin tipo asignado';
    return docTypes.find((t) => t.id === documentTypeId)?.name ?? 'Tipo no encontrado';
  };

  const isImage = (doc: DocItem) => doc.mime_type?.startsWith('image/');

  const isPdf = (doc: DocItem) =>
    doc.mime_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf');

  const isWord = (doc: DocItem) => {
    const name = doc.file_name.toLowerCase();
    return (
      doc.mime_type === 'application/msword' ||
      doc.mime_type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.doc') ||
      name.endsWith('.docx')
    );
  };

  const getPreviewSrc = () => {
    if (!previewDoc || !previewUrl) return '';

    if (isWord(previewDoc)) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
        previewUrl,
      )}`;
    }

    return previewUrl;
  };

  const statusBadge = (s: string) => {
    if (s === 'verified') {
      return (
        <Badge className="bg-success text-success-foreground text-xs">
          Verificado
        </Badge>
      );
    }

    if (s === 'rejected') {
      return (
        <Badge variant="destructive" className="text-xs">
          Rechazado
        </Badge>
      );
    }

    return (
      <Badge className="bg-accent text-accent-foreground text-xs">
        Subido
      </Badge>
    );
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold font-display">Expediente Digital</h1>

          <div className="flex flex-col sm:flex-row gap-2">
            <Dialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="lg">
                  <Eye size={16} />
                  Ver documentos
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle className="font-display">
                    Documentos subidos
                  </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
                  <div className="space-y-2 overflow-y-auto max-h-[70vh] pr-1">
                    {docs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Aún no has subido documentos
                      </p>
                    ) : (
                      docs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border"
                        >
                          <div className="p-2 rounded-lg bg-muted">
                            {doc.mime_type?.startsWith('image/') ? (
                              <ImageIcon size={16} />
                            ) : (
                              <FileText size={16} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {doc.file_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {getDocTypeName(doc.document_type_id)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString('es-MX')}
                            </p>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => viewDocument(doc)}
                            aria-label="Ver documento"
                          >
                            <Eye size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openInNewTab(doc)}
                            aria-label="Abrir en nueva pestaña"
                          >
                            <ExternalLink size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteDoc.mutate(doc)}
                            disabled={deleteDoc.isPending}
                            aria-label="Eliminar documento"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden min-h-[420px] bg-muted/30">
                    {!previewDoc || !previewUrl ? (
                      <div className="h-full min-h-[420px] flex items-center justify-center text-center p-6">
                        <div>
                          <FileText className="mx-auto mb-3 text-muted-foreground" />
                          <p className="text-sm font-medium">
                            Selecciona un documento para verlo
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Puedes visualizar imágenes, PDF, DOC y DOCX.
                          </p>
                        </div>
                      </div>
                    ) : isImage(previewDoc) ? (
                      <div className="h-[70vh] overflow-auto p-3">
                        <img
                          src={previewUrl}
                          alt={previewDoc.file_name}
                          className="max-w-full mx-auto rounded-lg"
                        />
                      </div>
                    ) : (
                      <iframe
                        title={previewDoc.file_name}
                        src={getPreviewSrc()}
                        className="w-full h-[70vh]"
                      />
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Upload size={16} />
                  Subir documento
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display">
                    Subir nuevo documento
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo de documento</Label>
                    <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Selecciona un tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {docTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Archivo imagen, PDF, DOC o DOCX, máx 10 MB</Label>
                    <Input
                      ref={fileRef}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleFile}
                      disabled={upload.isPending}
                    />
                  </div>

                  {upload.isPending && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Subiendo archivo...
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium">Completitud del expediente</p>
              <span className="text-sm font-bold text-primary">
                {completeness}%
              </span>
            </div>

            <Progress value={completeness} className="h-3" />

            <p className="text-xs text-muted-foreground">
              {uploadedRequired} de {requiredTypes.length} documentos requeridos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">
              Documentos requeridos
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : (
              requiredTypes.map((t) => {
                const uploadedDocs = docs.filter((d) => d.document_type_id === t.id);
                const uploaded = uploadedDocs[0];

                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border"
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        uploaded
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {uploaded ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                    </div>

                    {uploaded ? (
                      <div className="flex items-center gap-2">
                        {statusBadge(uploaded.verification_status)}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDocsDialogOpen(true);
                            viewDocument(uploaded);
                          }}
                        >
                          Ver documentos
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTypeId(t.id);
                          setDialogOpen(true);
                        }}
                      >
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
            <CardTitle className="text-base font-display">
              Todos los documentos
            </CardTitle>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aún no has subido documentos
              </p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-muted">
                      {doc.mime_type?.startsWith('image/') ? (
                        <ImageIcon size={16} />
                      ) : (
                        <FileText size={16} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getDocTypeName(doc.document_type_id)} ·{' '}
                        {new Date(doc.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </div>

                    {statusBadge(doc.verification_status)}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => viewDocument(doc)}
                      aria-label="Ver"
                    >
                      <Eye size={16} />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteDoc.mutate(doc)}
                      disabled={deleteDoc.isPending}
                      aria-label="Eliminar"
                    >
                      <Trash2 size={16} />
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
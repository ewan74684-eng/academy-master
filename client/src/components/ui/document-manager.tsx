import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, File, X, Trash2, Plus, Eye, Download } from 'lucide-react';
import { Button } from './button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

interface Document {
  id: string;
  documentType: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

interface DocumentManagerProps {
  playerId: string;
  documents: Document[];
  documentType: string;
  documentLabel: string;
  accept?: string;
  maxSize?: number;
  readOnly?: boolean;
  className?: string;
}

export default function DocumentManager({ 
  playerId,
  documents,
  documentType,
  documentLabel,
  accept = ".png,.jpg,.jpeg,.pdf",
  maxSize = 10 * 1024 * 1024,
  readOnly = false,
  className = ""
}: DocumentManagerProps) {
  const [dragOver, setDragOver] = useState(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get documents of this type
  const typeDocuments = documents.filter(doc => doc.documentType === documentType);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append(documentType, file);
      formData.append('playerId', playerId);
      formData.append('documentType', documentType);
      
      const response = await fetch(`/api/players/${playerId}/documents`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Document uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/players', playerId] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Upload failed", 
        description: error.message || "Failed to upload document",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/players/documents/${documentId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Delete failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Document deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/players', playerId] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      setDeleteDocumentId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Delete failed", 
        description: error.message || "Failed to delete document",
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = useCallback((file: File) => {
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `File size must be less than ${Math.round(maxSize / (1024 * 1024))}MB`,
        variant: "destructive"
      });
      return;
    }
    
    uploadMutation.mutate(file);
  }, [maxSize, uploadMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    
    if (readOnly) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect, readOnly]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!readOnly) setDragOver(true);
  }, [readOnly]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleViewDocument = (document: Document) => {
    window.open(`/api/players/documents/${document.id}/file`, '_blank');
  };

  const handleDownloadDocument = (document: Document) => {
    const link = window.document.createElement('a');
    link.href = `/api/players/documents/${document.id}/file?download=1`;
    link.download = document.fileName;
    link.click();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {documentLabel}
        </label>
        {!readOnly && (
          <span className="text-xs text-gray-500">
            {accept.replace(/\./g, '').toUpperCase()} up to {Math.round(maxSize / (1024 * 1024))}MB
          </span>
        )}
      </div>

      {/* Existing Documents */}
      {typeDocuments.length > 0 && (
        <div className="space-y-2">
          {typeDocuments.map((document) => (
            <div key={document.id} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {document.fileName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(document.fileSize)} • {new Date(document.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleViewDocument(document)}
                  className="h-8 w-8 p-0"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownloadDocument(document)}
                  className="h-8 w-8 p-0"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteDocumentId(document.id)}
                    className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      {!readOnly && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          } ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => document.getElementById(`file-input-${documentType}`)?.click()}
        >
          {uploadMutation.isPending ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-600">Uploading...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center mb-2">
                <Plus className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600 mb-1">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-gray-500">
                Add {documentLabel.toLowerCase()}
              </p>
            </>
          )}
          
          <input
            id={`file-input-${documentType}`}
            type="file"
            accept={accept}
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDocumentId} onOpenChange={() => setDeleteDocumentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDocumentId && deleteMutation.mutate(deleteDocumentId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
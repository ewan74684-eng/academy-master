import { useCallback, useId, useRef, useState } from 'react';
import { Upload, File, X } from 'lucide-react';
import { Button } from './button';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
}

export default function FileUpload({ 
  onFileSelect, 
  accept = "*", 
  maxSize = 5 * 1024 * 1024,
  className = ""
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Each instance needs its own input, otherwise every drop zone opens the first one on the page
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (file.size > maxSize) {
      alert(`File size must be less than ${Math.round(maxSize / (1024 * 1024))}MB`);
      return;
    }
    
    setSelectedFile(file);
    onFileSelect(file);
  }, [maxSize, onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
    // Reset so selecting the same file again still fires onChange
    e.target.value = '';
  }, [handleFileSelect]);

  const removeFile = useCallback(() => {
    setSelectedFile(null);
    onFileSelect(null);
  }, [onFileSelect]);

  if (selectedFile) {
    return (
      <div className={`border-2 border-gray-300 border-dashed rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <File className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-600 truncate">
              {selectedFile.name}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={removeFile}
            className="h-6 w-6 p-0 hover:bg-red-100"
          >
            <X className="h-4 w-4 text-red-500" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
    );
  }

  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
        ${dragOver 
          ? 'border-academy-blue bg-blue-50' 
          : 'border-gray-300 hover:border-academy-blue hover:bg-blue-50'
        }
        ${className}
      `}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
      <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
      <p className="text-xs text-gray-500 mt-1">
        {accept.replace(/\./g, '').toUpperCase()} up to {Math.round(maxSize / (1024 * 1024))}MB
      </p>
      
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}

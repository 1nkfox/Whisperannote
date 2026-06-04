import { useState, useCallback } from "react";
import { Upload, FileAudio, X, Play, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}

export function FileUpload({ onFileSelect, selectedFile }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(file => 
      file.type.startsWith('audio/') || file.type.startsWith('video/')
    );
    
    if (audioFile) {
      onFileSelect(audioFile);
    }
  }, [onFileSelect]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (file: File) => {
    // This would need actual audio duration calculation in a real app
    return "2:34";
  };

  if (selectedFile) {
    return (
      <Card className="h-70 p-6 relative bg-[#FFFFFF] dark:bg-gray-800">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 w-6 h-6 text-[#6C7278] hover:text-[#1A1C1E]"
          onClick={() => onFileSelect(null)}
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="flex items-center mb-4">
          <FileAudio className="w-12 h-12 text-[#B8422E] mr-4" />
          <div className="flex-1">
            <p className="font-medium text-[#1A1C1E] dark:text-white" style={{ fontFamily: 'Fraunces, serif' }}>
              {selectedFile.name}
            </p>
            <p className="text-sm text-[#6C7278] mt-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {formatFileSize(selectedFile.size)} • {formatDuration(selectedFile)}
            </p>
          </div>
        </div>

        <div className="w-full h-20 bg-[#F7F5F2] dark:bg-gray-700 rounded-sm mb-4 border border-[rgba(108,114,120,0.15)]">
          <div className="w-full h-full flex items-center justify-center text-[#6C7278]" style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em' }}>
            AUDIO WAVEFORM
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="secondary" size="sm" className="w-24">
            <Play className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button variant="secondary" size="sm" className="w-24">
            <RotateCcw className="w-4 h-4 mr-2" />
            Change
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`h-70 p-8 border-2 border-dashed transition-all duration-200 bg-[#FFFFFF] ${
        isDragging
          ? 'border-[#B8422E] bg-[#FDF6F5]'
          : 'border-[rgba(108,114,120,0.3)] hover:border-[#B8422E]'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Upload className="w-16 h-16 text-[#6C7278] mb-4" />

        <p className="mb-2 text-[#1A1C1E] dark:text-white" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '1.125rem' }}>
          Drop your audio or video file here
        </p>

        <p className="text-sm text-[#6C7278] mb-6">
          Supports MP3, MP4, WAV, M4A, FLAC (max 500MB)
        </p>

        <div className="flex gap-3">
          <Button asChild className="bg-[#B8422E] hover:bg-[#9E3827] text-white border-0 rounded-sm">
            <label className="cursor-pointer">
              Choose File
              <input
                type="file"
                className="hidden"
                accept="audio/*,video/*"
                onChange={handleFileSelect}
              />
            </label>
          </Button>
          <Button variant="outline" className="border-[rgba(108,114,120,0.3)] text-[#1A1C1E] hover:border-[#1A1C1E] rounded-sm">
            From URL
          </Button>
        </div>
      </div>
    </Card>
  );
}
import { useState } from "react";
import { FileText, Copy, Download, Edit, X } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";

type ProcessingStage = "analyzing" | "processing" | "transcribing" | "finalizing";

interface ResultsZoneProps {
  state: "idle" | "processing" | "completed";
  progress?: number;
  currentStage?: ProcessingStage;
  transcript?: string;
  onCancel?: () => void;
  onEdit?: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
}

export function ResultsZone({
  state,
  progress = 0,
  currentStage = "analyzing",
  transcript = "",
  onCancel,
  onEdit,
  onCopy,
  onDownload
}: ResultsZoneProps) {
  const stages = [
    { key: "analyzing", label: "Analyzing" },
    { key: "processing", label: "Processing" },
    { key: "transcribing", label: "Transcribing" },
    { key: "finalizing", label: "Finalizing" }
  ];

  const getCurrentStageIndex = () => {
    return stages.findIndex(stage => stage.key === currentStage);
  };

  const getTimeRemaining = () => {
    const remaining = Math.max(1, Math.round((100 - progress) / 20));
    return `~${remaining} minute${remaining !== 1 ? 's' : ''} remaining`;
  };

  if (state === "idle") {
    return (
      <Card className="flex-1 min-h-80 flex items-center justify-center bg-[#FFFFFF] border border-[rgba(108,114,120,0.2)]">
        <div className="text-center text-[#6C7278]">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p style={{ fontFamily: 'Public Sans, sans-serif' }}>Transcription results will appear here</p>
        </div>
      </Card>
    );
  }

  if (state === "processing") {
    return (
      <Card className="flex-1 min-h-80 p-6 bg-[#FFFFFF] border border-[rgba(108,114,120,0.2)]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[#1A1C1E]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '1.125rem' }}>Processing Audio...</h3>
          <button
            onClick={onCancel}
            className="text-sm text-[#6C7278] border border-[rgba(108,114,120,0.3)] rounded-sm px-3 py-1.5 hover:border-[#1A1C1E] hover:text-[#1A1C1E] transition-colors"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Cancel
          </button>
        </div>

        {/* Progress Stages */}
        <div className="mb-6">
          <div className="flex justify-between mb-3 gap-1">
            {stages.map((stage, index) => (
              <div
                key={stage.key}
                className={`flex-1 h-0.5 ${
                  index <= getCurrentStageIndex()
                    ? 'bg-[#B8422E]'
                    : 'bg-[rgba(108,114,120,0.2)]'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between" style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: '#6C7278' }}>
            {stages.map(stage => (
              <span key={stage.key} className="uppercase">{stage.label}</span>
            ))}
          </div>
        </div>

        {/* Progress Details */}
        <div className="bg-[#F7F5F2] p-4 rounded-sm">
          <Progress value={progress} className="mb-3 [&>div]:bg-[#B8422E]" />
          <div className="flex justify-between text-sm text-[#6C7278]">
            <span>{progress}% complete</span>
            <span>{getTimeRemaining()}</span>
          </div>
        </div>
      </Card>
    );
  }

  if (state === "completed") {
    return (
      <Card className="flex-1 min-h-80 p-6 bg-[#FFFFFF] border border-[rgba(108,114,120,0.2)]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[#1A1C1E]" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '1.125rem' }}>Transcription Complete</h3>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="rounded-sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="secondary" size="sm" className="rounded-sm" onClick={onCopy}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
            <Button size="sm" className="rounded-sm bg-[#B8422E] hover:bg-[#9E3827] text-white" onClick={onDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>

        <ScrollArea className="h-96 bg-[#F7F5F2] rounded-sm p-4">
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#1A1C1E]" style={{ fontFamily: 'Public Sans, sans-serif' }}>
            {transcript || "Your transcription will appear here..."}
          </div>
        </ScrollArea>
      </Card>
    );
  }

  return null;
}
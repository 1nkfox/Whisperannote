import { ChevronDown, Folder, Zap } from "lucide-react";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface AdvancedSettingsProps {
  model: string;
  device: string;
  includeTimestamps: boolean;
  speakerIdentification: boolean;
  wordConfidence: boolean;
  savePath: string;
  onModelChange: (value: string) => void;
  onDeviceChange: (value: string) => void;
  onTimestampsChange: (checked: boolean) => void;
  onSpeakerIdChange: (checked: boolean) => void;
  onWordConfidenceChange: (checked: boolean) => void;
  onSavePathChange: (value: string) => void;
}

export function AdvancedSettings({
  model,
  device,
  includeTimestamps,
  speakerIdentification,
  wordConfidence,
  savePath,
  onModelChange,
  onDeviceChange,
  onTimestampsChange,
  onSpeakerIdChange,
  onWordConfidenceChange,
  onSavePathChange
}: AdvancedSettingsProps) {
  return (
    <div className="sticky top-6">
      <Card className="border border-[rgba(108,114,120,0.2)] bg-[#FFFFFF] dark:border-gray-700">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-[rgba(108,114,120,0.1)] dark:border-gray-800">
          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: '#1A1C1E', fontWeight: 500 }} className="uppercase dark:text-white">
            Advanced Settings
          </span>
          <Button variant="ghost" size="icon" className="w-5 h-5">
            <ChevronDown className="w-4 h-4 text-[#6C7278]" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {/* Whisper Model */}
          <div className="space-y-2">
            <Label className="text-[#6C7278] uppercase">
              Whisper Model
            </Label>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="large-v3">large-v3 (Best Quality)</SelectItem>
                <SelectItem value="large-v2">large-v2</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="small">small</SelectItem>
                <SelectItem value="base">base</SelectItem>
                <SelectItem value="tiny">tiny (Fastest)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#6C7278]">
              Larger models provide better accuracy but take longer
            </p>
          </div>

          {/* Processing Device */}
          <div className="space-y-2">
            <Label className="text-[#6C7278] uppercase">
              Processing Device
            </Label>
            <div className="space-y-2">
              <div
                className={`p-3 border rounded-sm cursor-pointer transition-colors ${
                  device === "gpu"
                    ? "border-[#1A1C1E] bg-[#F7F5F2]"
                    : "border-[rgba(108,114,120,0.2)] bg-[#FFFFFF]"
                }`}
                onClick={() => onDeviceChange("gpu")}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#1A1C1E]" style={{ fontFamily: 'Public Sans, sans-serif' }}>GPU (CUDA)</span>
                  <span className="text-xs bg-[#1A1C1E] text-white px-2 py-0.5 rounded-sm" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.08em' }}>FAST</span>
                </div>
                <p className="text-xs text-[#6C7278] mt-1">
                  NVIDIA RTX 3080 - 10GB VRAM
                </p>
              </div>

              <div className="p-3 border rounded-sm border-[rgba(108,114,120,0.15)] bg-[#FAFAF9] opacity-50 cursor-not-allowed select-none">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#6C7278]" style={{ fontFamily: 'Public Sans, sans-serif' }}>CPU</span>
                  <span className="text-xs text-[#6C7278] border border-[rgba(108,114,120,0.2)] px-2 py-0.5 rounded-sm" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.08em' }}>UNAVAILABLE</span>
                </div>
                <p className="text-xs text-[#6C7278] mt-1">
                  Intel Core i7-10700K
                </p>
              </div>
            </div>
          </div>

          {/* Output Options */}
          <div className="space-y-2">
            <Label className="text-[#6C7278] uppercase">
              Output Options
            </Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="timestamps"
                  checked={includeTimestamps}
                  onCheckedChange={onTimestampsChange}
                />
                <Label htmlFor="timestamps" className="text-sm">Include timestamps</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="speaker-id"
                  checked={speakerIdentification}
                  onCheckedChange={onSpeakerIdChange}
                />
                <Label htmlFor="speaker-id" className="text-sm">Speaker identification</Label>
              </div>
              
            </div>
          </div>

          {/* Save Location */}
          <div className="space-y-2">
            <Label className="text-[#6C7278] uppercase">
              Save Location
            </Label>
            <div className="flex gap-2">
              <Input 
                value={savePath}
                onChange={(e) => onSavePathChange(e.target.value)}
                placeholder="/Users/user/Documents"
                className="flex-1"
              />
              <Button variant="outline" size="icon" className="w-10 h-10">
                <Folder className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
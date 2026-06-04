import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";

interface QuickSettingsProps {
  language: string;
  quality: string;
  format: string;
  onLanguageChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onFormatChange: (value: string) => void;
}

export function QuickSettings({
  language,
  quality,
  format,
  onLanguageChange,
  onQualityChange,
  onFormatChange
}: QuickSettingsProps) {
  return (
    <Card className="p-5 bg-[#FFFFFF] border border-[rgba(108,114,120,0.2)] dark:border-gray-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Language Selector */}
        <div className="space-y-2">
          <Label className="text-[#6C7278] uppercase">
            Output Language
          </Label>
          <div className="relative">
            <Select value={language} onValueChange={onLanguageChange}>
              <SelectTrigger className="w-full h-10">
                <div className="flex items-center">
                  <span className="mr-3">🌐</span>
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="it">Italian</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
                <SelectItem value="ru">Russian</SelectItem>
                <SelectItem value="ja">Japanese</SelectItem>
                <SelectItem value="ko">Korean</SelectItem>
                <SelectItem value="zh">Chinese</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quality Preset */}
        <div className="space-y-2">
          <Label className="text-[#6C7278] uppercase">
            Quality Preset
          </Label>
          <div className="flex bg-[#F7F5F2] dark:bg-gray-800 rounded-sm p-1">
            {(["fast", "balanced", "accurate"] as const).map((q) => (
              <button
                key={q}
                className={`flex-1 h-8 text-sm rounded-sm transition-colors capitalize ${
                  quality === q
                    ? "bg-[#1A1C1E] text-white"
                    : "text-[#6C7278] hover:text-[#1A1C1E]"
                }`}
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                onClick={() => onQualityChange(q)}
              >
                {q.charAt(0).toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Output Format */}
        <div className="space-y-2">
          <Label className="text-[#6C7278] uppercase">
            Output Format
          </Label>
          <Select value={format} onValueChange={onFormatChange}>
            <SelectTrigger className="w-full h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="txt">Plain Text (.txt)</SelectItem>
              <SelectItem value="srt">SubRip (.srt)</SelectItem>
              <SelectItem value="vtt">WebVTT (.vtt)</SelectItem>
              <SelectItem value="json">JSON (.json)</SelectItem>
              <SelectItem value="csv">CSV (.csv)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}
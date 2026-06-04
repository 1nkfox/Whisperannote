import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface FloatingControlsProps {
  disabled: boolean;
  onStart: () => void;
}

export function FloatingControls({ disabled, onStart }: FloatingControlsProps) {
  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
      <Card className="px-6 py-4 bg-[#FFFFFF] shadow-[0_4px_24px_rgba(26,28,30,0.12)] border border-[rgba(108,114,120,0.2)] dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <Button
            size="lg"
            disabled={disabled}
            onClick={onStart}
            className="h-12 px-8 bg-[#B8422E] hover:bg-[#9E3827] text-white rounded-sm disabled:opacity-40 disabled:cursor-not-allowed border-0"
          >
            Start Transcription
          </Button>
          <span className="text-[#6C7278]" style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em' }}>⌘ + Enter</span>
        </div>
      </Card>
    </div>
  );
}
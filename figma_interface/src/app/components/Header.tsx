import { HelpCircle, Settings, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

interface HeaderProps {
  isDark: boolean;
  onThemeToggle: () => void;
}

export function Header({ isDark, onThemeToggle }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 w-full h-16 z-50 bg-[#FFFFFF] border-b border-[rgba(108,114,120,0.2)] dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center justify-between h-full px-6">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-[#B8422E] rounded-sm flex items-center justify-center mr-4">
            <span className="text-white" style={{ fontFamily: 'Fraunces, serif', fontWeight: 500 }}>W</span>
          </div>
          <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: '1.125rem', color: '#1A1C1E' }} className="dark:text-white">
            Whisper Transcription Studio
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <HelpCircle className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <Settings className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-8 h-8"
            onClick={onThemeToggle}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { FileUpload } from "./components/FileUpload";
import { QuickSettings } from "./components/QuickSettings";
import { ResultsZone } from "./components/ResultsZone";
import { AdvancedSettings } from "./components/AdvancedSettings";
import { FloatingControls } from "./components/FloatingControls";

type AppState = "idle" | "processing" | "completed";
type ProcessingStage = "analyzing" | "processing" | "transcribing" | "finalizing";

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [appState, setAppState] = useState<AppState>("idle");
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState<ProcessingStage>("analyzing");
  const [transcript, setTranscript] = useState("");

  // Quick Settings
  const [language, setLanguage] = useState("auto");
  const [quality, setQuality] = useState("balanced");
  const [format, setFormat] = useState("txt");

  // Advanced Settings
  const [model, setModel] = useState("large-v3");
  const [device, setDevice] = useState("gpu");
  const [includeTimestamps, setIncludeTimestamps] = useState(false);
  const [speakerIdentification, setSpeakerIdentification] = useState(false);
  const [wordConfidence, setWordConfidence] = useState(false);
  const [savePath, setSavePath] = useState("/Users/user/Documents");

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (selectedFile && appState === "idle") {
          handleStartTranscription();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFile, appState]);

  const handleStartTranscription = () => {
    if (!selectedFile) return;
    
    setAppState("processing");
    setProgress(0);
    setCurrentStage("analyzing");

    // Simulate processing stages
    const stages: ProcessingStage[] = ["analyzing", "processing", "transcribing", "finalizing"];
    let currentStageIndex = 0;
    let currentProgress = 0;

    const interval = setInterval(() => {
      currentProgress += Math.random() * 15 + 5; // Random progress increment
      
      if (currentProgress >= 100) {
        currentProgress = 100;
        setProgress(100);
        
        // Complete processing
        setTimeout(() => {
          setAppState("completed");
          setTranscript(generateMockTranscript());
          clearInterval(interval);
        }, 500);
      } else {
        setProgress(Math.min(currentProgress, 100));
        
        // Update stage based on progress
        const newStageIndex = Math.floor((currentProgress / 100) * stages.length);
        if (newStageIndex > currentStageIndex && newStageIndex < stages.length) {
          currentStageIndex = newStageIndex;
          setCurrentStage(stages[currentStageIndex]);
        }
      }
    }, 1000);
  };

  const generateMockTranscript = () => {
    return `Welcome to this demonstration of the Whisper Transcription Studio. This is a sample transcription that shows how the application would display the results of processing an audio or video file.

The transcription accuracy depends on several factors including the quality of the audio, the selected model, and the language settings. In a real implementation, this would be the actual transcribed text from your uploaded file.

You can edit this text, copy it to your clipboard, or download it in various formats including plain text, SRT subtitles, or JSON with timestamps and confidence scores.`;
  };

  const handleCancel = () => {
    setAppState("idle");
    setProgress(0);
    setCurrentStage("analyzing");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(transcript);
    // In a real app, show a toast notification
  };

  const handleDownload = () => {
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F7F5F2] dark:bg-gray-900">
      <Header 
        isDark={isDark} 
        onThemeToggle={() => setIsDark(!isDark)} 
      />
      
      <main className="pt-16 p-6 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 h-full">
            {/* Primary Column */}
            <div className="space-y-6">
              {/* File Upload */}
              <FileUpload 
                selectedFile={selectedFile}
                onFileSelect={setSelectedFile}
              />

              {/* Quick Settings */}
              <QuickSettings
                language={language}
                quality={quality}
                format={format}
                onLanguageChange={setLanguage}
                onQualityChange={setQuality}
                onFormatChange={setFormat}
              />

              {/* Results Zone */}
              <ResultsZone
                state={appState}
                progress={progress}
                currentStage={currentStage}
                transcript={transcript}
                onCancel={handleCancel}
                onCopy={handleCopy}
                onDownload={handleDownload}
              />
            </div>

            {/* Settings Sidebar */}
            <div className="hidden lg:block">
              <AdvancedSettings
                model={model}
                device={device}
                includeTimestamps={includeTimestamps}
                speakerIdentification={speakerIdentification}
                wordConfidence={wordConfidence}
                savePath={savePath}
                onModelChange={setModel}
                onDeviceChange={setDevice}
                onTimestampsChange={setIncludeTimestamps}
                onSpeakerIdChange={setSpeakerIdentification}
                onWordConfidenceChange={setWordConfidence}
                onSavePathChange={setSavePath}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Floating Controls */}
      <FloatingControls
        disabled={!selectedFile || appState === "processing"}
        onStart={handleStartTranscription}
      />
    </div>
  );
}
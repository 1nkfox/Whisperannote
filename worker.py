import os
import tempfile
import subprocess
import json
from datetime import timedelta
from PyQt5.QtCore import QThread, pyqtSignal

import whisper
from pyannote.audio import Pipeline
from huggingface_hub import login
from dotenv import load_dotenv
load_dotenv()

HF_TOKEN = os.getenv("HUGGINGFACE_HUB_TOKEN")
MODEL_ID = "pyannote/speaker-diarization-3.1"
CHUNK_SECONDS = 300   # 5 минут


class TranscribeWorker(QThread):
    log_signal = pyqtSignal(str)
    progress_signal = pyqtSignal(int)
    finished_signal = pyqtSignal()

    def __init__(self, file_path, output_dir, model, device):
        super().__init__()
        self.file_path = file_path
        self.output_dir = output_dir
        self.model = model
        self.device = device
        self._stop = False

    def stop(self):
        self._stop = True

    def extract_wav(self, src, sr=16_000):
        wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-i", src,
             "-ar", str(sr), "-ac", "1", "-c:a", "pcm_s16le", wav, "-y"],
            capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode())
        return wav

    def get_audio_duration(self, path):
        import wave
        with wave.open(path, 'rb') as w:
            frames = w.getnframes()
            rate = w.getframerate()
            return frames / float(rate)

    def fmt_ts(self, sec):
        td = timedelta(seconds=sec)
        return f"{td.seconds//3600:02d}:{(td.seconds//60)%60:02d}:{td.seconds%60 + td.microseconds/1e6:06.3f}"

    def write_srt(self, segments, path):
        with open(path, "a", encoding="utf-8") as srt:
            for i, seg in enumerate(segments, 1):
                srt.write(f"{i}\n")
                start, end = seg["start"], seg["end"]
                srt.write(f"{self.fmt_ts(start).replace('.',',')} --> {self.fmt_ts(end).replace('.',',')}\n")
                srt.write(f"{seg['speaker']}: {seg['text']}\n\n")

    def run(self):
        wav_path = None
        try:
            os.environ["SPEECHBRAIN_LOCAL_STRATEGY"] = "COPY"
            os.environ["HUGGINGFACE_HUB_TOKEN"] = HF_TOKEN
            login(HF_TOKEN, add_to_git_credential=False)

            name = os.path.splitext(os.path.basename(self.file_path))[0]
            wav_path = self.extract_wav(self.file_path)
            total_duration = self.get_audio_duration(wav_path)
            n_chunks = int(total_duration // CHUNK_SECONDS) + 1

            self.log_signal.emit("Загрузка пайплайна PyAnnote...")
            pipeline = Pipeline.from_pretrained(MODEL_ID, use_auth_token=HF_TOKEN)
            dia = pipeline({"audio": wav_path})
            spk_segments = [{"start": tr.start, "end": tr.end, "speaker": lab}
                            for tr, _, lab in dia.itertracks(yield_label=True)]

            def speaker_at(t):
                for s in spk_segments:
                    if s["start"] <= t <= s["end"]:
                        return s["speaker"]
                return "unknown"

            self.log_signal.emit(f"Загрузка модели whisper {self.model} на {self.device.upper()}...")
            wh = whisper.load_model(self.model, device=self.device)

            base = os.path.join(self.output_dir, name)
            json_path = base + ".json"
            txt_path = base + ".txt"
            srt_path = base + ".srt"
            md_path = base + ".md"

            for p in [json_path, txt_path, srt_path, md_path]:
                if os.path.exists(p):
                    os.remove(p)

            with open(json_path, "w", encoding="utf-8") as jf:
                jf.write("[\n")

            for chunk_idx in range(n_chunks):
                start_sec = chunk_idx * CHUNK_SECONDS
                end_sec = min((chunk_idx + 1) * CHUNK_SECONDS, total_duration)

                chunk_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
                subprocess.run([
                    "ffmpeg", "-y", "-i", wav_path,
                    "-ss", str(start_sec), "-to", str(end_sec),
                    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", chunk_wav
                ], capture_output=True)

                self.log_signal.emit(f"Обработка чанка {chunk_idx+1}/{n_chunks} ({int(start_sec)}–{int(end_sec)} сек)")
                asr = wh.transcribe(chunk_wav, language="ru", verbose=False, initial_prompt=None)

                merged = []
                for seg in asr["segments"]:
                    global_start = seg["start"] + start_sec
                    global_end = seg["end"] + start_sec
                    merged.append({
                        "speaker": speaker_at((global_start + global_end) / 2),
                        "start": global_start,
                        "end": global_end,
                        "text": seg["text"].strip()
                    })

                with open(json_path, "a", encoding="utf-8") as jf:
                    for idx, seg in enumerate(merged):
                        jf.write(json.dumps(seg, ensure_ascii=False, indent=2))
                        if not (chunk_idx == n_chunks - 1 and idx == len(merged) - 1):
                            jf.write(",\n")
                with open(txt_path, "a", encoding="utf-8") as tf:
                    for seg in merged:
                        tf.write(f"[{self.fmt_ts(seg['start'])}] {seg['speaker']}: {seg['text']}\n")
                self.write_srt(merged, srt_path)

                # Удаление временного чанка
                try:
                    os.remove(chunk_wav)
                except Exception:
                    pass
                self.progress_signal.emit(int(100 * (chunk_idx + 1) / n_chunks))
                if self._stop:
                    self.log_signal.emit("Процесс остановлен пользователем.")
                    break

            with open(json_path, "a", encoding="utf-8") as jf:
                jf.write("\n]")

            with open(txt_path, "r", encoding="utf-8") as src, \
                 open(md_path,  "w", encoding="utf-8") as dst:
                dst.write(src.read())

            self.progress_signal.emit(100)
            self.log_signal.emit("Сохранено:\n" + "\n".join([json_path, txt_path, srt_path, md_path]))
        except Exception as e:
            self.log_signal.emit(f"Ошибка: {str(e)}")
        finally:
            # Очистка временного wav файла
            if wav_path and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except Exception:
                    pass
        self.finished_signal.emit()

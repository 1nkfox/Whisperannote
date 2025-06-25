import sys
import os
import datetime
import tempfile
import subprocess
import json
from datetime import timedelta
from PyQt5 import QtWidgets, QtCore
from worker import TranscribeWorker

class TitleBar(QtWidgets.QWidget):
    def __init__(self, parent):
        super().__init__(parent)
        self.parent = parent
        self.setFixedHeight(40)
        self.setStyleSheet("background-color: #1e1e2f;")
        self.init_ui()

    def init_ui(self):
        self.layout = QtWidgets.QHBoxLayout(self)
        self.layout.setContentsMargins(10, 0, 10, 0)

        self.title = QtWidgets.QLabel("Whisper + PyAnnote Диаризация")
        self.title.setStyleSheet("color: white; font: 14pt;")
        self.layout.addWidget(self.title)

        self.layout.addStretch()

        self.min_btn = QtWidgets.QPushButton("-")
        self.min_btn.setFixedSize(30, 30)
        self.min_btn.setStyleSheet("background-color: #2e2e3f; color: white; border: none;")
        self.min_btn.clicked.connect(self.parent.showMinimized)
        self.layout.addWidget(self.min_btn)

        self.close_btn = QtWidgets.QPushButton("×")
        self.close_btn.setFixedSize(30, 30)
        self.close_btn.setStyleSheet("background-color: #2e2e3f; color: white; border: none;")
        self.close_btn.clicked.connect(self.parent.close)
        self.layout.addWidget(self.close_btn)

    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.LeftButton:
            self.offset = event.pos()

    def mouseMoveEvent(self, event):
        if event.buttons() == QtCore.Qt.LeftButton:
            self.parent.move(self.parent.pos() + event.pos() - self.offset)

class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(QtCore.Qt.FramelessWindowHint)
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground)

        self.central_widget = QtWidgets.QWidget()
        self.central_widget.setStyleSheet("""
            background-color: #0d1b2a;
            color: white;
        """)
        self.setCentralWidget(self.central_widget)

        self.layout = QtWidgets.QVBoxLayout(self.central_widget)
        self.layout.setContentsMargins(0, 0, 0, 0)

        self.title_bar = TitleBar(self)
        self.layout.addWidget(self.title_bar)

        self.init_ui()
        self.worker = None

    def log_with_time(self, message):
        now = datetime.datetime.now().strftime('%H:%M:%S')
        self.log_box.append(f"[{now}] {message}")

    def init_ui(self):
        content_layout = QtWidgets.QVBoxLayout()
        content_layout.setAlignment(QtCore.Qt.AlignCenter)

        self.file_label = QtWidgets.QLabel("Файл не выбран")
        self.file_label.setAlignment(QtCore.Qt.AlignCenter)
        self.file_label.setStyleSheet("color: white;")
        self.file_btn = QtWidgets.QPushButton("Загрузить файл")
        self.file_btn.setStyleSheet("color: white; background-color: #162447;")
        self.file_btn.clicked.connect(self.choose_file)

        self.save_dir_label = QtWidgets.QLabel("Папка для сохранения:")
        self.save_dir_label.setStyleSheet("color: white;")
        self.save_dir_edit = QtWidgets.QLineEdit(os.path.expanduser("~"))
        self.save_dir_edit.setStyleSheet("color: white; background-color: #1e1e2f; border: 1px solid #32405b;")
        self.save_dir_btn = QtWidgets.QPushButton("...")
        self.save_dir_btn.setFixedWidth(40)
        self.save_dir_btn.setStyleSheet("color: white; background-color: #162447;")
        self.save_dir_btn.clicked.connect(self.choose_dir)
        dir_layout = QtWidgets.QHBoxLayout()
        dir_layout.addWidget(self.save_dir_edit)
        dir_layout.addWidget(self.save_dir_btn)

        self.model_label = QtWidgets.QLabel("Модель Whisper:")
        self.model_label.setStyleSheet("color: white;")
        self.model_combo = QtWidgets.QComboBox()
        self.model_combo.addItems(["large-v3", "large-v3-turbo"])
        self.model_combo.setStyleSheet("color: white; background-color: #1e1e2f; border: 1px solid #32405b;")

        self.device_label = QtWidgets.QLabel("Устройство:")
        self.device_label.setStyleSheet("color: white;")
        self.device_combo = QtWidgets.QComboBox()
        self.device_combo.addItems(["GPU (cuda)", "CPU"])
        self.device_combo.setStyleSheet("color: white; background-color: #1e1e2f; border: 1px solid #32405b;")

        self.start_btn = QtWidgets.QPushButton("Запуск")
        self.start_btn.setStyleSheet("color: white; background-color: #1b263b;")
        self.start_btn.clicked.connect(self.start_process)
        self.stop_btn = QtWidgets.QPushButton("Остановить")
        self.stop_btn.setStyleSheet("color: white; background-color: #1b263b;")
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self.stop_process)

        self.log_box = QtWidgets.QTextEdit()
        self.log_box.setReadOnly(True)
        self.log_box.setStyleSheet("background-color: #1e1e2f; color: white; border: 1px solid #32405b;")
        self.progress = QtWidgets.QProgressBar()
        self.progress.setValue(0)
        self.progress.setTextVisible(True)
        self.progress.setStyleSheet("""
            QProgressBar {
                color: white;
                background-color: #162447;
                border: 1px solid #32405b;
                text-align: center;
            }
            QProgressBar::chunk {
                background-color: #3a506b;
            }
        """)

        debug_label = QtWidgets.QLabel("Отладочная панель")
        debug_label.setStyleSheet("color: white;")

        content_layout.addWidget(self.file_label)
        content_layout.addWidget(self.file_btn)
        content_layout.addSpacing(10)
        content_layout.addWidget(self.save_dir_label)
        content_layout.addLayout(dir_layout)
        content_layout.addSpacing(10)
        content_layout.addWidget(self.model_label)
        content_layout.addWidget(self.model_combo)
        content_layout.addSpacing(10)
        content_layout.addWidget(self.device_label)
        content_layout.addWidget(self.device_combo)
        content_layout.addSpacing(30)
        content_layout.addWidget(self.start_btn)
        content_layout.addWidget(self.stop_btn)
        content_layout.addSpacing(20)
        content_layout.addWidget(debug_label)
        content_layout.addWidget(self.log_box)
        content_layout.addWidget(self.progress)

        self.layout.addLayout(content_layout)

    def choose_file(self):
        file, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Выбрать файл", "", "Аудио/Видео (*.mp4 *.mp3 *.wav)")
        if file:
            self.file_path = file
            self.file_label.setText(os.path.basename(file))
        else:
            self.file_path = None
            self.file_label.setText("Файл не выбран")

    def choose_dir(self):
        dir = QtWidgets.QFileDialog.getExistingDirectory(self, "Папка для сохранения")
        if dir:
            self.save_dir_edit.setText(dir)

    def start_process(self):
        if not hasattr(self, "file_path") or not self.file_path:
            self.log_with_time("Не выбран файл.")
            return
        self.log_box.clear()
        self.progress.setValue(0)
        self.start_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        device = "cuda" if self.device_combo.currentIndex() == 0 else "cpu"
        self.worker = TranscribeWorker(
            file_path=self.file_path,
            output_dir=self.save_dir_edit.text(),
            model=self.model_combo.currentText(),
            device=device
        )
        self.worker.log_signal.connect(self.log_with_time)
        self.worker.progress_signal.connect(self.progress.setValue)
        self.worker.finished_signal.connect(self.finish_process)
        self.worker.start()

    def stop_process(self):
        if self.worker:
            self.worker.stop()
            self.log_with_time("Процесс остановлен пользователем.")
            self.stop_btn.setEnabled(False)

    def finish_process(self):
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.log_with_time("Процесс завершён.")

if __name__ == "__main__":
    app = QtWidgets.QApplication(sys.argv)
    app.setStyleSheet("""
        QWidget { color: white; }
        QLineEdit, QTextEdit { color: white; background: #1e1e2f; border: 1px solid #32405b; }
        QPushButton { color: white; background: #162447; }
        QLabel { color: white; }
    """)
    window = MainWindow()
    window.resize(800, 600)
    window.show()
    sys.exit(app.exec_())

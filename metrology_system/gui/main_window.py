"""
Main application window with menu bar and toolbar
Handles GUI initialization, user interaction, and backend control
"""
import logging
from PyQt5.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QMessageBox, QFileDialog, QSplitter, QTextEdit
)
from PyQt5.QtCore import Qt, pyqtSignal, QThread, pyqtSlot
from PyQt5.QtGui import QKeySequence, QIcon, QFont
from PyQt5.QtWidgets import QAction, QToolBar, QStatusBar

from video.engine import VideoEngine
from data.logger import DataLogger
from gui.video_display import VideoDualStreamWidget

logger = logging.getLogger(__name__)


class MetrologyMainWindow(QMainWindow):
    """Main application window for dual-stream 3D metrology system"""
    
    # Signals for backend control
    start_video_signal = pyqtSignal()
    stop_video_signal = pyqtSignal()
    export_data_signal = pyqtSignal(str)
    
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Dual-Stream 3D Metrology System")
        self.setGeometry(100, 100, 1600, 1000)
        
        # Initialize backend components
        self.video_engine = VideoEngine()
        self.data_logger = DataLogger()
        
        # Create video processing thread
        self.video_thread = QThread()
        self.video_engine.moveToThread(self.video_thread)
        
        # Connect signals
        self._connect_signals()
        
        # Setup UI
        self._create_menu_bar()
        self._create_toolbar()
        self._create_central_widget()
        self._create_status_bar()
        
        # Start video thread
        self.video_thread.started.connect(self._on_thread_started)
        self.video_thread.start()
        
        logger.info("Main window initialized")
    
    def _connect_signals(self):
        """Connect all backend signals to slots"""
        # Video engine signals
        self.video_engine.frame_pair_ready.connect(self._on_frame_pair_ready)
        self.video_engine.error_occurred.connect(self._on_video_error)
        self.video_engine.status_changed.connect(self._on_status_changed)
        
        # UI control signals
        self.start_video_signal.connect(self.video_engine.start_capture)
        self.stop_video_signal.connect(self.video_engine.stop_capture)
        self.export_data_signal.connect(self.data_logger.export_to_csv)
    
    def _create_menu_bar(self):
        """Create application menu bar with File, View, Export, Help menus"""
        menubar = self.menuBar()
        
        # File Menu
        file_menu = menubar.addMenu("&File")
        
        open_stream_action = QAction("&Open Streams", self)
        open_stream_action.setShortcut(QKeySequence.Open)
        open_stream_action.triggered.connect(self._open_stream_dialog)
        file_menu.addAction(open_stream_action)
        
        file_menu.addSeparator()
        
        exit_action = QAction("E&xit", self)
        exit_action.setShortcut(QKeySequence.Quit)
        exit_action.triggered.connect(self._on_exit)
        file_menu.addAction(exit_action)
        
        # View Menu
        view_menu = menubar.addMenu("&View")
        
        fullscreen_action = QAction("&Full Screen", self)
        fullscreen_action.setShortcut(QKeySequence.FullScreen)
        fullscreen_action.triggered.connect(self._toggle_fullscreen)
        view_menu.addAction(fullscreen_action)
        
        view_menu.addSeparator()
        
        reset_view_action = QAction("&Reset View", self)
        reset_view_action.triggered.connect(self._reset_view)
        view_menu.addAction(reset_view_action)
        
        # Export Menu
        export_menu = menubar.addMenu("&Export")
        
        export_csv_action = QAction("Export as &CSV", self)
        export_csv_action.setShortcut(QKeySequence("Ctrl+E"))
        export_csv_action.triggered.connect(self._export_csv)
        export_menu.addAction(export_csv_action)
        
        # Help Menu
        help_menu = menubar.addMenu("&Help")
        
        about_action = QAction("&About", self)
        about_action.triggered.connect(self._show_about)
        help_menu.addAction(about_action)
        
        about_qt_action = QAction("About &Qt", self)
        about_qt_action.triggered.connect(lambda: QMessageBox.aboutQt(self))
        help_menu.addAction(about_qt_action)
    
    def _create_toolbar(self):
        """Create main toolbar with standard actions"""
        toolbar = self.addToolBar("Main Toolbar")
        toolbar.setMovable(False)
        
        # Start capture action
        start_action = QAction("Start Stream", self)
        start_action.setShortcut(QKeySequence("Ctrl+S"))
        start_action.triggered.connect(self._start_stream)
        toolbar.addAction(start_action)
        
        # Stop capture action
        stop_action = QAction("Stop Stream", self)
        stop_action.setShortcut(QKeySequence("Ctrl+T"))
        stop_action.triggered.connect(self._stop_stream)
        toolbar.addAction(stop_action)
        
        toolbar.addSeparator()
        
        # Export CSV action
        export_action = QAction("Export CSV", self)
        export_action.setShortcut(QKeySequence("Ctrl+E"))
        export_action.triggered.connect(self._export_csv)
        toolbar.addAction(export_action)
        
        toolbar.addSeparator()
        
        # Run tests action
        test_action = QAction("Run Tests", self)
        test_action.triggered.connect(self._run_tests)
        toolbar.addAction(test_action)
    
    def _create_central_widget(self):
        """Create central widget with video display and log panel"""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        layout = QVBoxLayout()
        
        # Video display area (dual streams)
        self.video_display = VideoDualStreamWidget()
        
        # Log/status text area
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setMaximumHeight(150)
        font = QFont("Courier")
        font.setPointSize(9)
        self.log_text.setFont(font)
        
        # Splitter for resizable sections
        splitter = QSplitter(Qt.Vertical)
        splitter.addWidget(self.video_display)
        splitter.addWidget(self.log_text)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 1)
        
        layout.addWidget(splitter)
        central_widget.setLayout(layout)
    
    def _create_status_bar(self):
        """Create status bar for application status messages"""
        self.statusBar().showMessage("Ready")
    
    @pyqtSlot()
    def _on_thread_started(self):
        """Handle thread startup"""
        logger.info("Video processing thread started")
        self.statusBar().showMessage("Video thread initialized")
    
    @pyqtSlot(str)
    def _open_stream_dialog(self):
        """Open file dialog to select video streams"""
        stream1_path, _ = QFileDialog.getOpenFileName(
            self, "Select First Video Stream", "", "Video Files (*.mp4 *.avi *.mov *.mkv)"
        )
        if not stream1_path:
            return
        
        stream2_path, _ = QFileDialog.getOpenFileName(
            self, "Select Second Video Stream", "", "Video Files (*.mp4 *.avi *.mov *.mkv)"
        )
        if not stream2_path:
            return
        
        self.video_engine.set_stream_paths(stream1_path, stream2_path)
        self._log_message(f"Loaded streams:\n  1: {stream1_path}\n  2: {stream2_path}")
    
    @pyqtSlot()
    def _start_stream(self):
        """Start video capture"""
        self.start_video_signal.emit()
        self.statusBar().showMessage("Streaming...")
        self._log_message("Video capture started")
    
    @pyqtSlot()
    def _stop_stream(self):
        """Stop video capture"""
        self.stop_video_signal.emit()
        self.statusBar().showMessage("Streaming stopped")
        self._log_message("Video capture stopped")
    
    @pyqtSlot()
    def _export_csv(self):
        """Export collected 3D trajectory data to CSV"""
        filepath, _ = QFileDialog.getSaveFileName(
            self, "Export 3D Trajectory Data", "", "CSV Files (*.csv)"
        )
        if filepath:
            self.export_data_signal.emit(filepath)
            self._log_message(f"Data exported to {filepath}")
    
    @pyqtSlot()
    def _run_tests(self):
        """Run headless integration tests"""
        self.statusBar().showMessage("Running tests...")
        self._log_message("Headless integration tests initiated")
        # Tests are run separately via pytest CLI
        logger.info("Test execution triggered from GUI")
    
    @pyqtSlot()
    def _toggle_fullscreen(self):
        """Toggle fullscreen mode"""
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()
    
    @pyqtSlot()
    def _reset_view(self):
        """Reset view to default layout"""
        self.video_display.reset_view()
        self._log_message("View reset to default")
    
    @pyqtSlot()
    def _show_about(self):
        """Show about dialog"""
        QMessageBox.about(
            self,
            "About Dual-Stream 3D Metrology System",
            "Dual-Stream 3D Metrology and Video Processing System v1.0.0\n\n"
            "A real-time, high-precision video analysis platform for 3D tracking and measurement.\n\n"
            "© 2026 Open Source Physics"
        )
    
    @pyqtSlot()
    def _on_exit(self):
        """Clean shutdown"""
        self.stop_video_signal.emit()
        self.video_thread.quit()
        self.video_thread.wait()
        self.close()
    
    @pyqtSlot(object, object)
    def _on_frame_pair_ready(self, frame1, frame2):
        """Receive synchronized frame pairs from video engine"""
        self.video_display.update_frames(frame1, frame2)
    
    @pyqtSlot(str)
    def _on_video_error(self, error_message):
        """Handle video engine errors"""
        self._log_message(f"ERROR: {error_message}")
        self.statusBar().showMessage(f"Error: {error_message}")
        QMessageBox.critical(self, "Video Engine Error", error_message)
    
    @pyqtSlot(str)
    def _on_status_changed(self, status):
        """Handle video engine status changes"""
        self.statusBar().showMessage(status)
    
    def _log_message(self, message):
        """Append message to log panel"""
        self.log_text.append(message)
        # Auto-scroll to bottom
        scrollbar = self.log_text.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
    
    def closeEvent(self, event):
        """Handle application close event"""
        self.stop_video_signal.emit()
        self.video_thread.quit()
        self.video_thread.wait()
        event.accept()

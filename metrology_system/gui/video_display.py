"""
Dual video stream display widget
Renders synchronized video frames from both cameras side-by-side
"""
import logging
import numpy as np
from PyQt5.QtWidgets import QWidget, QHBoxLayout, QLabel
from PyQt5.QtCore import Qt, pyqtSlot
from PyQt5.QtGui import QImage, QPixmap, QFont
from PyQt5.QtCore import QTimer

logger = logging.getLogger(__name__)


class VideoDualStreamWidget(QWidget):
    """Widget to display two synchronized video streams side-by-side"""
    
    def __init__(self):
        super().__init__()
        self.current_frame1 = None
        self.current_frame2 = None
        
        layout = QHBoxLayout()
        layout.setSpacing(10)
        
        # Left stream label
        self.label_stream1 = QLabel("Stream 1 (Left)")
        self.label_stream1.setAlignment(Qt.AlignCenter)
        self.label_stream1.setMinimumSize(640, 480)
        self.label_stream1.setStyleSheet("border: 2px solid #333; background-color: #000;")
        font = QFont()
        font.setPointSize(10)
        self.label_stream1.setFont(font)
        
        # Right stream label
        self.label_stream2 = QLabel("Stream 2 (Right)")
        self.label_stream2.setAlignment(Qt.AlignCenter)
        self.label_stream2.setMinimumSize(640, 480)
        self.label_stream2.setStyleSheet("border: 2px solid #333; background-color: #000;")
        self.label_stream2.setFont(font)
        
        layout.addWidget(self.label_stream1)
        layout.addWidget(self.label_stream2)
        
        self.setLayout(layout)
    
    @pyqtSlot(object, object)
    def update_frames(self, frame1, frame2):
        """Update both video frames for display"""
        self.current_frame1 = frame1
        self.current_frame2 = frame2
        self._display_frame(frame1, self.label_stream1)
        self._display_frame(frame2, self.label_stream2)
    
    def _display_frame(self, frame, label):
        """Convert numpy array frame to QPixmap and display"""
        if frame is None:
            return
        
        # Ensure frame is in BGR format (OpenCV default)
        if len(frame.shape) == 2:
            # Grayscale to BGR
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        elif frame.shape[2] == 4:
            # RGBA to BGR
            frame = cv2.cvtColor(frame, cv2.COLOR_RGBA2BGR)
        
        # Convert BGR to RGB for Qt
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, ch = frame_rgb.shape
        
        # Create QImage
        q_img = QImage(frame_rgb.data, w, h, 3 * w, QImage.Format_RGB888)
        pixmap = QPixmap.fromImage(q_img)
        
        # Scale to fit label while maintaining aspect ratio
        label_width = label.width()
        label_height = label.height()
        scaled_pixmap = pixmap.scaledToWidth(
            max(label_width - 4, 1),
            Qt.SmoothTransformation
        )
        
        label.setPixmap(scaled_pixmap)
    
    def reset_view(self):
        """Reset view to initial state"""
        self.label_stream1.clear()
        self.label_stream1.setText("Stream 1 (Left)")
        self.label_stream2.clear()
        self.label_stream2.setText("Stream 2 (Right)")
        self.current_frame1 = None
        self.current_frame2 = None


# Import cv2 at module level for frame display
import cv2

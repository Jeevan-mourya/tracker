#!/usr/bin/env python3
"""
Dual-Stream 3D Metrology and Video Processing System
Main application entry point with GUI integration
"""
import sys
import logging
from pathlib import Path

from PyQt5.QtWidgets import QApplication
from gui.main_window import MetrologyMainWindow

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Initialize and launch the main application"""
    app = QApplication(sys.argv)
    
    # Set application metadata
    app.setApplicationName("Dual-Stream 3D Metrology System")
    app.setApplicationVersion("1.0.0")
    app.setOrganizationName("OpenSourcePhysics")
    
    # Create and show main window
    window = MetrologyMainWindow()
    window.show()
    
    logger.info("Application started successfully")
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()

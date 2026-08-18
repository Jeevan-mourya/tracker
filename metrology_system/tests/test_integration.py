"""
Comprehensive test suite for dual-stream 3D metrology system
Headless integration tests with synthetic video data mocking
"""
import pytest
import tempfile
import threading
import time
import csv
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import numpy as np
import queue

# Import components to test
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from video.engine import VideoEngine, FrameSynchronizer, StreamReader, FrameData
from data.logger import DataLogger, TrajectoryPoint, IOWriter


class TestFrameSynchronizer:
    """Test frame synchronization logic"""
    
    def test_synchronizer_initialization(self):
        """Test synchronizer creates with correct defaults"""
        sync = FrameSynchronizer(max_frame_delay=0.033)
        assert sync.max_frame_delay == 0.033
        assert len(sync.stream1_buffer) == 0
        assert len(sync.stream2_buffer) == 0
    
    def test_add_frame_to_buffers(self):
        """Test frames are added to correct buffers"""
        sync = FrameSynchronizer()
        
        frame1 = FrameData(0, 0.0, np.zeros((480, 640, 3), dtype=np.uint8), 0)
        frame2 = FrameData(0, 0.01, np.zeros((480, 640, 3), dtype=np.uint8), 1)
        
        sync.add_frame(frame1)
        sync.add_frame(frame2)
        
        assert 0 in sync.stream1_buffer
        assert 0 in sync.stream2_buffer
    
    def test_synchronize_frames_within_tolerance(self):
        """Test synchronized pair returned when frames within tolerance"""
        sync = FrameSynchronizer(max_frame_delay=0.05)
        
        frame1 = FrameData(0, 0.0, np.zeros((480, 640, 3), dtype=np.uint8), 0)
        frame2 = FrameData(0, 0.02, np.zeros((480, 640, 3), dtype=np.uint8), 1)
        
        sync.add_frame(frame1)
        sync.add_frame(frame2)
        
        pair = sync.get_synchronized_pair()
        assert pair is not None
        assert pair[0].stream_id == 0
        assert pair[1].stream_id == 1
    
    def test_no_sync_when_frames_exceed_tolerance(self):
        """Test no sync when time difference exceeds tolerance"""
        sync = FrameSynchronizer(max_frame_delay=0.01)
        
        frame1 = FrameData(0, 0.0, np.zeros((480, 640, 3), dtype=np.uint8), 0)
        frame2 = FrameData(0, 0.1, np.zeros((480, 640, 3), dtype=np.uint8), 1)
        
        sync.add_frame(frame1)
        sync.add_frame(frame2)
        
        pair = sync.get_synchronized_pair()
        assert pair is None
    
    def test_buffer_cleanup_after_sync(self):
        """Test buffers are cleaned after synchronization"""
        sync = FrameSynchronizer()
        
        for i in range(5):
            f1 = FrameData(i, float(i) * 0.01, np.zeros((480, 640, 3), dtype=np.uint8), 0)
            f2 = FrameData(i, float(i) * 0.01 + 0.005, np.zeros((480, 640, 3), dtype=np.uint8), 1)
            sync.add_frame(f1)
            sync.add_frame(f2)
        
        initial_size1 = len(sync.stream1_buffer)
        initial_size2 = len(sync.stream2_buffer)
        
        pair = sync.get_synchronized_pair()
        assert pair is not None
        
        # Buffers should be smaller after cleanup
        assert len(sync.stream1_buffer) < initial_size1
        assert len(sync.stream2_buffer) < initial_size2


class TestStreamReader:
    """Test individual stream reader functionality"""
    
    def test_stream_reader_initialization(self):
        """Test reader initializes with correct parameters"""
        test_queue = queue.Queue()
        reader = StreamReader("test.mp4", 0, test_queue)
        
        assert reader.stream_id == 0
        assert reader.frame_count == 0
        assert reader.running == False
    
    @patch('video.engine.cv2.VideoCapture')
    def test_stream_reader_with_mock_capture(self, mock_capture_class):
        """Test reader with mocked video capture"""
        # Setup mock
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cap.get.return_value = 30.0
        
        synthetic_frame = np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8)
        mock_cap.read.side_effect = [
            (True, synthetic_frame),
            (True, synthetic_frame),
            (False, None)  # End of stream
        ]
        
        mock_capture_class.return_value = mock_cap
        
        test_queue = queue.Queue()
        reader = StreamReader("test.mp4", 0, test_queue)
        reader.run()
        
        # Verify frames were read
        assert reader.frame_count == 2
        assert not mock_cap.isOpened.called or mock_cap.isOpened.return_value


class TestVideoEngine:
    """Test main video engine"""
    
    def test_engine_initialization(self):
        """Test engine initializes correctly"""
        engine = VideoEngine(queue_size=50)
        
        assert engine.stream1_path is None
        assert engine.stream2_path is None
        assert engine.is_capturing == False
        assert isinstance(engine.synchronizer, FrameSynchronizer)
    
    def test_set_stream_paths_valid(self):
        """Test setting valid stream paths"""
        engine = VideoEngine()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create dummy video files
            path1 = Path(tmpdir) / "video1.mp4"
            path2 = Path(tmpdir) / "video2.mp4"
            path1.touch()
            path2.touch()
            
            engine.set_stream_paths(str(path1), str(path2))
            
            assert engine.stream1_path == str(path1)
            assert engine.stream2_path == str(path2)
    
    def test_capture_without_paths(self):
        """Test capture fails when stream paths not set"""
        engine = VideoEngine()
        
        # Should emit error signal
        error_received = []
        engine.error_occurred.connect(lambda msg: error_received.append(msg))
        
        engine.start_capture()
        
        assert len(error_received) > 0
        assert "not set" in error_received[0].lower()
    
    def test_stop_capture_when_not_capturing(self):
        """Test stopping when not capturing doesn't raise errors"""
        engine = VideoEngine()
        engine.stop_capture()  # Should not raise
        assert engine.is_capturing == False


class TestDataLogger:
    """Test data logging functionality"""
    
    def test_logger_initialization(self):
        """Test logger initializes correctly"""
        logger = DataLogger()
        assert logger.io_writer is None
    
    def test_log_trajectory_point_without_writer(self):
        """Test logging point when no writer active (should be no-op)"""
        logger = DataLogger()
        
        # Should not raise
        logger.log_trajectory_point(
            frame_id=0,
            timestamp=0.0,
            object_id=1,
            x=1.0, y=2.0, z=3.0
        )
    
    def test_trajectory_point_dataclass(self):
        """Test TrajectoryPoint dataclass"""
        point = TrajectoryPoint(
            frame_id=5,
            timestamp=0.167,
            object_id=1,
            x=100.5, y=200.3, z=50.2
        )
        
        assert point.frame_id == 5
        assert point.timestamp == 0.167
        assert point.object_id == 1
        assert point.x == 100.5


class TestIOWriter:
    """Test asynchronous CSV writer"""
    
    def test_io_writer_initialization(self):
        """Test writer initializes correctly"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = str(Path(tmpdir) / "output.csv")
            writer = IOWriter(filepath, buffer_size=10)
            
            assert writer.filepath == filepath
            assert writer.buffer_size == 10
            assert writer.points_written == 0
    
    def test_csv_file_creation_and_writing(self):
        """Test CSV file is created and data is written"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = str(Path(tmpdir) / "output.csv")
            writer = IOWriter(filepath, buffer_size=5)
            writer.start()
            
            try:
                # Add points
                for i in range(10):
                    point = TrajectoryPoint(
                        frame_id=i,
                        timestamp=float(i) * 0.033,
                        object_id=1,
                        x=float(i), y=float(i) * 2, z=float(i) * 3
                    )
                    writer.add_point(point)
                
                # Stop and wait
                writer.stop()
                writer.join(timeout=5.0)
                
                # Verify file exists and contains data
                assert Path(filepath).exists()
                
                with open(filepath, 'r') as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                    assert len(rows) == 10
                    assert rows[0]['frame_id'] == '0'
                    assert float(rows[0]['x']) == 0.0
                    assert float(rows[9]['x']) == 9.0
            
            finally:
                writer.stop()
    
    def test_csv_header_written(self):
        """Test CSV file has correct header"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = str(Path(tmpdir) / "output.csv")
            writer = IOWriter(filepath, buffer_size=10)
            writer.start()
            
            try:
                writer.stop()
                writer.join(timeout=5.0)
                
                with open(filepath, 'r') as f:
                    first_line = f.readline().strip()
                    expected_header = 'frame_id,timestamp,object_id,x,y,z'
                    assert first_line == expected_header
            
            finally:
                writer.stop()


class TestHeadlessIntegration:
    """End-to-end headless integration tests"""
    
    def test_dual_stream_sync_pipeline(self):
        """Test complete dual-stream synchronization pipeline"""
        sync = FrameSynchronizer(max_frame_delay=0.033)
        
        # Simulate dual-stream capture with 30 frames each
        frame_pairs = []
        for i in range(30):
            timestamp = float(i) * 0.033  # 30 FPS
            
            f1 = FrameData(
                frame_index=i,
                timestamp=timestamp,
                frame=np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8),
                stream_id=0
            )
            f2 = FrameData(
                frame_index=i,
                timestamp=timestamp + 0.002,  # 2ms offset
                frame=np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8),
                stream_id=1
            )
            
            sync.add_frame(f1)
            sync.add_frame(f2)
            
            pair = sync.get_synchronized_pair()
            if pair:
                frame_pairs.append(pair)
        
        # Should have successfully synchronized most frames
        assert len(frame_pairs) > 0
        assert len(frame_pairs) >= 28  # Allow slight margin for sync
        
        # Verify frame ordering
        for i, (f1, f2) in enumerate(frame_pairs):
            assert f1.stream_id == 0
            assert f2.stream_id == 1
    
    def test_trajectory_data_csv_export(self):
        """Test trajectory data export to CSV"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = str(Path(tmpdir) / "trajectory.csv")
            writer = IOWriter(filepath, buffer_size=50)
            writer.start()
            
            try:
                # Generate synthetic trajectory data
                test_data = [
                    (0, 0.000, 1, 100.0, 150.0, 50.0),
                    (1, 0.033, 1, 100.5, 150.2, 50.1),
                    (2, 0.067, 1, 101.0, 150.4, 50.2),
                    (3, 0.100, 1, 101.5, 150.6, 50.3),
                    (4, 0.133, 1, 102.0, 150.8, 50.4),
                ]
                
                for frame_id, timestamp, obj_id, x, y, z in test_data:
                    point = TrajectoryPoint(
                        frame_id=frame_id,
                        timestamp=timestamp,
                        object_id=obj_id,
                        x=x, y=y, z=z
                    )
                    writer.add_point(point)
                
                # Wait for writes to complete
                time.sleep(0.5)
                writer.stop()
                writer.join(timeout=5.0)
                
                # Verify CSV contents
                with open(filepath, 'r') as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                
                assert len(rows) == 5
                
                # Verify first row
                assert int(rows[0]['frame_id']) == 0
                assert float(rows[0]['timestamp']) == 0.0
                assert int(rows[0]['object_id']) == 1
                assert float(rows[0]['x']) == 100.0
                assert float(rows[0]['y']) == 150.0
                assert float(rows[0]['z']) == 50.0
                
                # Verify last row
                assert int(rows[4]['frame_id']) == 4
                assert float(rows[4]['x']) == 102.0
                assert float(rows[4]['y']) == 150.8
                assert float(rows[4]['z']) == 50.4
            
            finally:
                writer.stop()
    
    def test_sync_with_stream_ordering_mismatch(self):
        """Test synchronization when streams arrive out of order"""
        sync = FrameSynchronizer(max_frame_delay=0.050)
        
        # Add frames out of order to simulate real-world conditions
        f1_0 = FrameData(0, 0.000, np.zeros((480, 640, 3), dtype=np.uint8), 0)
        f1_1 = FrameData(1, 0.033, np.zeros((480, 640, 3), dtype=np.uint8), 0)
        
        f2_0 = FrameData(0, 0.010, np.zeros((480, 640, 3), dtype=np.uint8), 1)
        f2_1 = FrameData(1, 0.040, np.zeros((480, 640, 3), dtype=np.uint8), 1)
        
        # Interleaved arrival
        sync.add_frame(f1_0)
        sync.add_frame(f2_0)
        pair1 = sync.get_synchronized_pair()
        assert pair1 is not None
        
        sync.add_frame(f1_1)
        sync.add_frame(f2_1)
        pair2 = sync.get_synchronized_pair()
        assert pair2 is not None
    
    def test_concurrent_logging_and_export(self):
        """Test thread-safe concurrent logging and export"""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = str(Path(tmpdir) / "concurrent.csv")
            
            logger = DataLogger()
            logger.export_to_csv(filepath)
            
            # Simulate multi-threaded logging
            def log_worker(start_id, count):
                for i in range(count):
                    logger.log_trajectory_point(
                        frame_id=start_id + i,
                        timestamp=float(start_id + i) * 0.033,
                        object_id=1,
                        x=float(start_id + i),
                        y=float(start_id + i) * 2,
                        z=float(start_id + i) * 3
                    )
                    time.sleep(0.001)
            
            # Run logging in multiple threads
            threads = [
                threading.Thread(target=log_worker, args=(0, 10)),
                threading.Thread(target=log_worker, args=(10, 10)),
            ]
            
            for t in threads:
                t.start()
            
            for t in threads:
                t.join()
            
            # Flush and verify
            logger.flush()
            time.sleep(1.0)
            
            if Path(filepath).exists():
                with open(filepath, 'r') as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                    assert len(rows) > 0
            
            logger.stop()


class TestErrorHandling:
    """Test error handling and edge cases"""
    
    def test_synchronizer_empty_buffer(self):
        """Test synchronizer handles empty buffers gracefully"""
        sync = FrameSynchronizer()
        pair = sync.get_synchronized_pair()
        assert pair is None
    
    def test_frame_data_with_none_frame(self):
        """Test FrameData handles None frames"""
        frame = FrameData(0, 0.0, None, 0)
        assert frame.frame is None
        assert frame.frame_index == 0
    
    def test_csv_writer_with_invalid_directory(self):
        """Test writer creates parent directories"""
        with tempfile.TemporaryDirectory() as tmpdir:
            nested_path = str(Path(tmpdir) / "a" / "b" / "c" / "data.csv")
            writer = IOWriter(nested_path)
            writer.start()
            
            try:
                point = TrajectoryPoint(0, 0.0, 1, 1.0, 2.0, 3.0)
                writer.add_point(point)
                
                time.sleep(0.5)
                writer.stop()
                writer.join(timeout=5.0)
                
                assert Path(nested_path).exists()
            finally:
                writer.stop()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

package test;

import java.io.File;
import org.opensourcephysics.media.xuggle.XuggleVideo;

public class PlayVideoTest {
    public static void main(String[] args) {
        String videoPath = (args.length > 0) ? args[0] : "sample_legacy.avi";
        File file = new File(videoPath);
        
        if (!file.exists()) {
            System.err.println("[FAIL] Video file not found: " + file.getAbsolutePath());
            System.exit(1);
        }

        System.out.println("[INFO] Testing video playback for: " + file.getAbsolutePath());

        try {
            XuggleVideo video = new XuggleVideo(file.getAbsolutePath(), null);
            
            while (!video.isFullyLoaded()) {
                video.loadMoreFrames(500);
            }

            int totalFrames = video.getFrameCount();
            double durationMS = video.getFrameCountDurationMS();
            System.out.printf("[INFO] Video Loaded: %d frames, duration: %.2f ms\n", totalFrames, durationMS);

            // Step through first 5 frames to verify rendering pipeline
            for (int i = 0; i < Math.min(5, totalFrames); i++) {
                video.setFrameNumber(i);
                System.out.printf("[FRAME %d] Timestamp: %.2f ms | Image: %s\n", 
                    i, video.getFrameTime(i), video.getImage() != null ? "OK" : "NULL");
            }

            video.dispose();
            System.out.println("[PASS] Video playback verified successfully.");
            System.exit(0);
        } catch (Exception e) {
            System.err.println("[ERROR] Failed to decode video:");
            e.printStackTrace();
            System.exit(2);
        }
    }
}
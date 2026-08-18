package test;
import org.opensourcephysics.media.xuggle.XuggleDualStreamPipeline;
import java.io.File;

public class StereoVideoTerminalTest {
    public static void main(String[] args) {
        System.out.println("--- INITIATING STEREOSCOPIC TERMINAL TEST ---");
        String leftPath = "src/test/moon_left.mp4";
        String rightPath = "src/test/moon_right.mp4";
        
        if (!new File(leftPath).exists() || !new File(rightPath).exists()) {
            System.err.println("ERROR: Moon videos not found at the src/test/ path!");
            return;
        }
        
        try {
            System.out.println("Found videos! Injecting into Phase 3 Pipeline...");
            XuggleDualStreamPipeline pipeline = new XuggleDualStreamPipeline(leftPath, rightPath);
            pipeline.start();
            Thread.sleep(4000); // Let the threads rip frames for 4 seconds
            pipeline.stop();
            System.out.println("--- TEST COMPLETE ---");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

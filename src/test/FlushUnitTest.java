package test;

import java.io.File;
import java.util.concurrent.TimeUnit;
import org.opensourcephysics.media.xuggle.XuggleDualStreamPipeline;

/**
 * Simple unit-style test (runnable main) to validate flush() behavior.
 * Exits with code 0 on success, non-zero on failure.
 */

public class FlushUnitTest {
    public static void main(String[] args) throws Exception {
        String baseline = (args.length > 0) ? args[0] : "src/test/duet.mp4";
        
        File videoFile = new File(baseline);
        if (!videoFile.exists()) {
            System.err.println("[FAIL] Target video file does not exist: " + videoFile.getAbsolutePath());
            System.exit(1);
        }

        System.out.println("[INFO] Initializing pipeline with: " + baseline);
        XuggleDualStreamPipeline pipeline = new XuggleDualStreamPipeline(baseline, baseline);
        pipeline.start();
        
        try {
            System.out.println("[INFO] Waiting up to 20 seconds for Xuggler/OSP initialization...");
            // Consume a few pairs to populate internal state
            for (int i = 0; i < 10; i++) {
                XuggleDualStreamPipeline.FramePair p = pipeline.pollPair(20, TimeUnit.SECONDS); // Increased to 20s
                if (p == null) {
                    System.err.println("[FAIL] Expected initial pairs but got EOS early");
                    System.exit(2);
                }
            }

            long matchedBefore = pipeline.getMatchedCount();
            
            pipeline.flush(true);

            double seekTarget = 2000.0;
            pipeline.seek(seekTarget);
            pipeline.flush(true);
            
            XuggleDualStreamPipeline.FramePair seekPair = pipeline.pollPair(10, TimeUnit.SECONDS);
            if (seekPair == null) {
                System.err.println("[FAIL] Expected pair after seek+flush but got none");
                System.exit(6);
            }
            double avgTs = seekPair.getTimestampMS();
            if (Math.abs(avgTs - seekTarget) > 1000.0) {
                System.err.printf("[FAIL] Seek target not honored: target=%.1f got=%.3f\n", seekTarget, avgTs);
                System.exit(7);
            }

            long matchedAfter = pipeline.getMatchedCount();
            if (matchedAfter > matchedBefore) {
                System.err.printf("[FAIL] matchedCount did not decrease after reset (before=%d after=%d)\n", matchedBefore, matchedAfter);
                System.exit(4);
            }

            System.out.println("[PASS] flush() cleared buffers and reset stats as expected");
            System.exit(0);
        } finally {
            pipeline.stop();
        }
    }
}
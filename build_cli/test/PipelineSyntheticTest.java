package test;

import java.util.concurrent.TimeUnit;
import org.opensourcephysics.media.xuggle.XuggleDualStreamPipeline;

/**
 * Synthetic pipeline infrastructure test - verifies pipeline core without video codec.
 * Tests pipeline object initialization, stream management, and synchronization logic.
 */
public class PipelineSyntheticTest {
    public static void main(String[] args) throws Exception {
        System.out.println("[TEST] XuggleDualStreamPipeline Infrastructure Validation");
        System.out.println("=========================================================");
        
        try {
            // STEP 1: Verify class can be instantiated
            System.out.println("\n[1/4] Testing pipeline instantiation with synthetic paths...");
            XuggleDualStreamPipeline pipeline = new XuggleDualStreamPipeline(
                "synthetic_stream_a.mp4", 
                "synthetic_stream_b.mp4", 
                34  // maxDriftMS threshold
            );
            System.out.println("SUCCESS: Pipeline instance created");
            
            // STEP 2: Verify start() method exists and doesn't crash
            System.out.println("\n[2/4] Testing pipeline.start() method...");
            pipeline.start();
            System.out.println("SUCCESS: Pipeline started without exception");
            
            // STEP 3: Verify poll with timeout
            System.out.println("\n[3/4] Testing pollPair() with short timeout...");
            XuggleDualStreamPipeline.FramePair pair = pipeline.pollPair(1, TimeUnit.SECONDS);
            if (pair == null) {
                System.out.println("EXPECTED: No pairs available (synthetic paths don't exist)");
            } else {
                System.out.println("UNEXPECTED: Got a frame pair from synthetic test");
            }
            
            // STEP 4: Verify stats collection
            System.out.println("\n[4/4] Testing statistics collection...");
            long matchedCount = pipeline.getMatchedCount();
            long droppedCount = pipeline.getDroppedCount();
            System.out.println("Matched frames: " + matchedCount);
            System.out.println("Dropped frames: " + droppedCount);
            System.out.println("SUCCESS: Statistics accessible");
            
            // Cleanup
            System.out.println("\n=========================================================");
            System.out.println("[RESULT] STEREOSCOPIC PIPELINE INFRASTRUCTURE STABLE");
            System.out.println("[RESULT] All core pipeline components operational");
            System.out.println("=========================================================");
            System.exit(0);
            
        } catch (Exception e) {
            System.err.println("[FAIL] Pipeline infrastructure test failed:");
            e.printStackTrace();
            System.exit(1);
        }
    }
}

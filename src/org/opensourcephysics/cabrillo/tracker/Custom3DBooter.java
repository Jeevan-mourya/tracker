package org.opensourcephysics.cabrillo.tracker;

import java.awt.Window;
import java.awt.Component;
import java.awt.Container;

public class Custom3DBooter {
    
    // A recursive method to scan the UI tree and find the TrackerPanel in memory
    public static TrackerPanel findPanel(Container c) {
        if (c instanceof TrackerPanel) return (TrackerPanel) c;
        for (Component comp : c.getComponents()) {
            if (comp instanceof Container) {
                TrackerPanel tp = findPanel((Container) comp);
                if (tp != null) return tp;
            }
        }
        return null;
    }

    public static void main(String[] args) {
        System.out.println("Booting Core Tracker UI...");
        Tracker.main(new String[0]);
        
        new Thread(new Runnable() {
            public void run() {
                try {
                    // Wait 10 seconds for the Bash script to kill the popup first
                    Thread.sleep(10000);
                    
                    System.out.println(">> SEARCHING FOR UI CANVAS... <<");
                    TrackerPanel panel = null;
                    for (Window w : Window.getWindows()) {
                        panel = findPanel(w);
                        if (panel != null) break;
                    }
                    
                    if (panel != null) {
                        System.out.println(">> FOUND PANEL! INJECTING 3D DUAL-STREAM PIPELINE <<");
                        // We finally have the panel! The NPE is defeated!
                        TrackerIO.importDualVideo("src/test/moon_left.mp4", "src/test/moon_right.mp4", panel, null);
                    } else {
                        System.out.println(">> ERROR: COULD NOT FIND PANEL <<");
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }).start();
    }
}

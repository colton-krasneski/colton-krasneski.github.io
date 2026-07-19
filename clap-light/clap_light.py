"""
Clap Light  —  clap your hands to toggle a Simply Conserve (Tuya) smart bulb.

Two halves:
  * EAR  : listens to the PC microphone and detects a clap (a short, loud spike).
  * HAND : talks to the bulb over your WiFi (local, no cloud) via tinytuya.

Before this works you must fill in the three BULB_* values below.
Get them by running:   py -m tinytuya wizard
(see SETUP.md in this folder for the click-by-click walkthrough).

Run it:                py clap_light.py
Tune it:               py clap_light.py --calibrate     (prints live sound levels)
Then set THRESHOLD to a bit above your normal room noise, below a clap.
"""

import argparse
import time

import numpy as np
import sounddevice as sd
import tinytuya

# ----------------------------------------------------------------------------
# 1. YOUR BULB  — fill these in from the tinytuya wizard (see SETUP.md)
# ----------------------------------------------------------------------------
BULB_ID = "PASTE_DEVICE_ID_HERE"
BULB_IP = "PASTE_DEVICE_IP_HERE"       # e.g. 192.168.1.42  (or "Auto" to scan)
BULB_KEY = "PASTE_LOCAL_KEY_HERE"
BULB_VERSION = 3.3                      # wizard tells you; usually 3.3, sometimes 3.4

# ----------------------------------------------------------------------------
# 2. CLAP DETECTION TUNING
# ----------------------------------------------------------------------------
THRESHOLD = 0.25        # 0.0-1.0 loudness that counts as a clap. Raise if it
                        # triggers on talking/music; lower if claps get missed.
COOLDOWN = 0.4          # seconds to ignore new claps after one fires (debounce)
SAMPLE_RATE = 44100
BLOCK = 1024            # samples per audio chunk (~23 ms)


def connect_bulb():
    """Open a local connection to the bulb and return it."""
    bulb = tinytuya.BulbDevice(BULB_ID, BULB_IP, BULB_KEY)
    bulb.set_version(BULB_VERSION)
    bulb.set_socketPersistent(True)   # keep the connection open = instant toggles
    return bulb


def run(calibrate=False):
    if not calibrate:
        bulb = connect_bulb()
        status = bulb.status()
        is_on = status.get("dps", {}).get("20", status.get("dps", {}).get("1", False))
        print(f"Connected to bulb. Currently {'ON' if is_on else 'OFF'}.")
    else:
        is_on = False
        print("CALIBRATE MODE — clap and watch the numbers. No bulb control.")

    print(f"Listening... (threshold={THRESHOLD})  Press Ctrl+C to stop.\n")

    last_clap = 0.0
    peak_seen = 0.0

    def on_audio(indata, frames, time_info, status):
        nonlocal last_clap, is_on, peak_seen
        # Loudness of this chunk = its loudest sample (0.0 - 1.0).
        level = float(np.abs(indata).max())

        if calibrate:
            peak_seen = max(peak_seen, level)
            bar = "#" * int(level * 50)
            print(f"\rlevel {level:0.3f}  peak {peak_seen:0.3f}  |{bar:<50}", end="")
            return

        now = time.time()
        if level >= THRESHOLD and (now - last_clap) > COOLDOWN:
            last_clap = now
            is_on = not is_on
            print(f"CLAP! (level {level:0.2f}) -> turning bulb {'ON' if is_on else 'OFF'}")
            try:
                bulb.turn_on() if is_on else bulb.turn_off()
            except Exception as e:
                print(f"  ...bulb command failed: {e}")

    with sd.InputStream(channels=1, samplerate=SAMPLE_RATE,
                        blocksize=BLOCK, callback=on_audio):
        try:
            while True:
                time.sleep(0.1)
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--calibrate", action="store_true",
                    help="Print live sound levels to help you pick THRESHOLD.")
    args = ap.parse_args()
    run(calibrate=args.calibrate)

# Clap Light — Setup

Clap your hands → your Simply Conserve bulb toggles on/off.

Everything is installed already. You only have **one manual step**: getting the
bulb's *local key* so your PC can talk to it directly over WiFi.

---

## Step 1 — Make sure the bulb is in the Smart Life app

Your Simply Conserve bulb is a **Tuya** device. Set it up in the free
**Smart Life** app (App Store / Google Play) if it isn't already:

1. Screw in the bulb, turn it on.
2. Smart Life app → **+** (top right) → **Add Device** → follow the pairing steps.
3. Note the network — the bulb and your **PC must be on the same WiFi**
   (2.4 GHz — these bulbs don't do 5 GHz).

## Step 2 — Get the local key (the only tricky bit)

The key lives in Tuya's developer portal. `tinytuya` has a wizard that fetches it.

1. Go to **https://iot.tuya.com/** → sign up (free) → log in.
2. **Cloud → Development → Create Cloud Project**
   (any name; pick your region — e.g. *Western America*; "Smart Home" is fine).
3. In the project, open the **Devices** tab → **Link App Account** →
   **Add App Account** → a QR code appears.
4. In the **Smart Life app** on your phone: **Me → the scan icon (top right)** →
   scan that QR code. Your bulb now shows up in the project.
5. Also on the project's **Service API** / **Authorization** page, make sure
   **"IoT Core"** and **"Authorization"** APIs are enabled (they usually are).
6. Back on your PC, in this folder, run:

   ```
   py -m tinytuya wizard
   ```

   It asks for **API Key**, **API Secret** (both on your Tuya project's
   *Overview* page), and your region. It then prints every device with its
   **Device ID**, **IP address**, **Local Key**, and **Version**, and saves them
   to `devices.json` in this folder.

## Step 3 — Plug the values into the script

Open `clap_light.py` and fill in the top section from the wizard output:

```python
BULB_ID      = "..."      # Device ID
BULB_IP      = "..."      # IP address  (or "Auto" to auto-scan)
BULB_KEY     = "..."      # Local Key
BULB_VERSION = 3.3        # whatever version the wizard reported
```

## Step 4 — Tune the clap threshold

```
py clap_light.py --calibrate
```

Clap a few times and watch the numbers. Pick a `THRESHOLD` (in `clap_light.py`)
that sits **above your normal room level but below a clap's peak** — e.g. if
talking shows ~0.1 and a clap hits ~0.4, set it to `0.25`.

## Step 5 — Run it

```
py clap_light.py
```

Clap. 👏 The lamp toggles. Ctrl+C to stop.

---

### Troubleshooting
- **Wizard finds the device but no local key / key is blank** → make sure you
  scanned the QR with Smart Life (not the *Tuya Smart* app) and the device is
  linked to the project; re-run the wizard.
- **Bulb command fails / times out** → PC and bulb must be on the same 2.4 GHz
  WiFi; try `BULB_IP = "Auto"`, or set `BULB_VERSION = 3.4`.
- **Triggers on talking or music** → raise `THRESHOLD`.
- **Misses claps** → lower `THRESHOLD`, or clap closer to the PC mic.
- **Want a double-clap to toggle (fewer accidents)?** → ask me, it's a small change.

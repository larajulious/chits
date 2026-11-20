# Chits store listing package

Everything here was produced on 18 Nov 2026 from real simulator captures of Chits with fictional sample data. Nothing has been uploaded to App Store Connect or Google Play.

| Folder | What's in it |
|---|---|
| `app-store/iphone-6.9/` | 8 screenshots, 1320×2868 (large Dynamic Island) |
| `app-store/iphone-medium/` | 8 screenshots, 1206×2622 (medium Dynamic Island, the set App Store Connect requires) |
| `app-store/iphone-duo-outer/` | 8 screenshots, 1398×2034 |
| `app-store/iphone-duo-inner/` | 3 screenshots, 2853×2007 landscape (02–04 only, see `reports/export-validation.md`) |
| `google-play/feature-graphic/` | Feature graphic, 1024×500 |
| `google-play/phone/` | Empty: blocked, no Android captures yet |
| `previews/` | Contact sheets, plus the Google Play template with clearly marked placeholders (not for upload) |
| `reports/` | ASO research, metadata proposals, copy and rationale, A/B plan, validation |
| `source/` | Everything needed to regenerate the assets |

## Regenerate
1. Seed a store simulator with fictional data: `source/seed/reseed.sh <udid> <Chits.app>`
2. Capture: `source/capture/capture.sh <udid> source/captures/<set> phone [--display=N]`
3. Edit copy, colours or layouts in `source/copy.json`
4. Compose: `python3 source/compose.py [device]`, then `python3 source/contact_sheets.py` and `python3 source/validate.py`

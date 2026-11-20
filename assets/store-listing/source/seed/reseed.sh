#!/bin/zsh
# reseed.sh <simulator-udid> <Chits.app> — fresh install + fictional seed data. Store-capture devices only.
set -eu
DEV=$1; APP=$2; HERE=${0:A:h}
xcrun simctl terminate $DEV com.larajulious.chitsapp 2>/dev/null || true
xcrun simctl uninstall $DEV com.larajulious.chitsapp 2>/dev/null || true
xcrun simctl install $DEV "$APP"
xcrun simctl launch $DEV com.larajulious.chitsapp >/dev/null
sleep 15
xcrun simctl terminate $DEV com.larajulious.chitsapp
C=$(xcrun simctl get_app_container $DEV com.larajulious.chitsapp data)
python3 -I "$HERE/seed_store_data.py" "$C/Documents/SQLite/chits.db" "$C/Documents/"
xcrun simctl launch $DEV com.larajulious.chitsapp >/dev/null

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
dsh=${DSH_BIN:-/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh}
lab=$(mktemp -d /tmp/dsh-annotations-smoke.XXXXXX)
export DSH_HOME=$lab
pid=
ok=false
cleanup() {
  if [[ -n $pid ]]; then kill "$pid" 2>/dev/null || :; wait "$pid" 2>/dev/null || :; fi
  if [[ $ok == true ]]; then
    resolved=$(realpath "$lab")
    [[ $resolved == "$(realpath /tmp)/dsh-annotations-smoke."* ]] || { echo "Unexpected cleanup target: $resolved" >&2; return 1; }
    rm -rf -- "$lab"
  else
    echo "Isolated test logs: $lab" >&2
  fi
}
trap cleanup EXIT

"$dsh" --profile annotations-smoke --from-default-profile web --dump-config >/dev/null
archive=$(npm pack --pack-destination "$lab" --silent)
"$dsh" plugin --profile annotations-smoke add "$lab/$archive" >/dev/null
node -e "const p=require(process.argv[1]); if (!p.dsh.profile.bundles.includes('dsh-annotations')) process.exit(1)" "$lab/profiles/annotations-smoke/package.json"
installed=$(realpath "$lab/profiles/annotations-smoke/node_modules/dsh-annotations")
[[ $installed == "$(realpath "$lab")/profiles/annotations-smoke/node_modules/dsh-annotations" ]] || { echo 'Package was linked, not installed' >&2; exit 1; }

for run in first restart; do
  log="$lab/$run.log"
  "$dsh" --profile annotations-smoke --no-open --host 127.0.0.1 --port 0 >"$log" 2>&1 &
  pid=$!
  for ((i=0; i<100; i++)); do
    if [[ -s $log ]] && grep -q '^dsh web: http' "$log"; then break; fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  sleep 1
  if ! kill -0 "$pid" 2>/dev/null || ! grep -q '^dsh web: http' "$log" || grep -Eq 'did not activate|failed to import|failed to register' "$log"; then
    echo "Isolated $run boot failed:" >&2
    sed -n '1,65p' "$log" >&2
    exit 1
  fi
  url=$(sed -n 's/^dsh web: \(http[^ ]*\).*/\1/p' "$log" | head -1)
  status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "${url%%\?*}")
  [[ $status == 200 || $status == 303 || $status == 401 ]] || { echo "Web responded $status" >&2; exit 1; }
  kill "$pid" 2>/dev/null || :
  wait "$pid" 2>/dev/null || :
  pid=
  echo "$run boot: OK"
done
ok=true

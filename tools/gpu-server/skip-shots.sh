# Local override (guest shot excluded on GPU pending a fix): FTF_SKIP_SHOTS=a,b drops those shots
# before rendering, and the video is still assembled (unlike --shots, which renders a partial set).
F=${1:-/root/ftf-capture-src}/tools/capture/capture.mjs
grep -q FTF_SKIP_SHOTS "$F" || sed -i "120a\\  if (process.env.FTF_SKIP_SHOTS) { const skip = process.env.FTF_SKIP_SHOTS.split(','); shots = shots.filter((s) => !skip.includes(s.name)); }" "$F"
sed -n 119,122p "$F"

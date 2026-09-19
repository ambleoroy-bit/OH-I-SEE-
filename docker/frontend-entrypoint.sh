#!/bin/sh
set -eu

RUNTIME_FILE="/usr/share/nginx/html/js/runtime-config.js"
mkdir -p "$(dirname "$RUNTIME_FILE")"

SUPABASE_URL="${SUPABASE_URL:-https://placeholder.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-placeholder-anon-key}"
API_BASE="${OHISEE_API_BASE:-/api}"
CONSTRUCTION_HERO_VIDEO_URL="${CONSTRUCTION_HERO_VIDEO_URL:-https://vsqdqgmndgjfhosozxfn.supabase.co/storage/v1/object/public/construction-videos/Contruction%20Video.mp4}"

cat > "$RUNTIME_FILE" <<EOF
window.OHISEE_RUNTIME = {
  SUPABASE_URL: '${SUPABASE_URL}',
  SUPABASE_ANON_KEY: '${SUPABASE_ANON_KEY}',
  API_BASE: '${API_BASE}',
  CONSTRUCTION_HERO_VIDEO_URL: '${CONSTRUCTION_HERO_VIDEO_URL}',
};
EOF

# Substitute API upstream for nginx proxy
export API_UPSTREAM="${API_UPSTREAM:-backend:3001}"
envsubst '${API_UPSTREAM}' < /etc/nginx/templates/default.conf.template > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'

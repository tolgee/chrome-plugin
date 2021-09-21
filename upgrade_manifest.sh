sed '3s/.*/  \"version\": \"'"$1"'\",/g' manifest.json > /tmp/manifest.json
cat /tmp/manifest.json > manifest.json
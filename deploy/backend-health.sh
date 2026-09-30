#!/bin/bash
set -euo pipefail
# Ubuntu's bash provides /dev/tcp; no package or external probe is downloaded.
exec 3<>/dev/tcp/127.0.0.1/8080
printf 'GET /actuator/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' >&3
IFS= read -r status <&3
[[ "$status" == 'HTTP/1.1 200 '* ]]

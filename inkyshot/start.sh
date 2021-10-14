#!/bin/bash

# set a hostname for mDNS (default to inkyshot.local)
if [ -n "${DEVICE_HOSTNAME}" ]
then
  curl -X PATCH --header "Content-Type:application/json" \
    --data "{\"network\": {\"hostname\": \"${DEVICE_HOSTNAME}\"}}" \
    "${BALENA_SUPERVISOR_ADDRESS}/v1/device/host-config?apikey=${BALENA_SUPERVISOR_API_KEY}" || true
fi

# Get the current device name
export DEVICE_NAME=$(curl -sX GET "https://api.balena-cloud.com/v5/device?\$filter=uuid%20eq%20'$BALENA_DEVICE_UUID'" \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $BALENA_API_KEY" | \
jq -r ".d | .[0] | .device_name")

# Run the display update once on container start
python /usr/app/update-display.py

# Save out the current env to a file so cron job can use it
export -p > /usr/app/env.sh

UDPATE_FREQUENCY="${UDPATE_FREQUENCY:-1}" # minutes

# Set default values if these env vars are not set
if [[ -z "${ALTERNATE_FREQUENCY}" ]]; then
  Alternate="0"
  [[ -z "${UPDATE_HOUR}" ]] && UpdateHour='9' || UpdateHour="${UPDATE_HOUR}"
else
  Alternate="*/${UDPATE_FREQUENCY}"
  UpdateHour='*'
fi

# Add the job to the crontab using update_hour var, defaulting to 9 AM
(echo "${Alternate} ${UpdateHour} * * * /usr/app/run-update.sh > /proc/1/fd/1 2>&1") | crontab -

# Start the cron daemon as PID 1
exec cron -f

#!/bin/bash

URL="http://localhost:3000/api/v1/ultimate/characters"

for i in {1..30}; do
  response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$URL")
  echo "Request $i: HTTP status $response"
  echo "Response: $response"
  echo "---"
  sleep 0.1
done
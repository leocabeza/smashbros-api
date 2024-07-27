#!/bin/bash

URL="http://localhost:3000/graphql/v1"
QUERY='{"query":"{ characters { name } }"}'

for i in {1..150}; do
  response=$(curl -s -X POST -H "Content-Type: application/json" -d "$QUERY" "$URL")
  http_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$QUERY" "$URL")
  echo "Request $i: HTTP status $http_status"
  echo "Response: $response"
  echo "---"
  sleep 0.1
done
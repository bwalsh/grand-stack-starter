# starts all individual services
npm run start-services &
# wait for their start
sleep 5
# start the gateway
npm run start-gateway

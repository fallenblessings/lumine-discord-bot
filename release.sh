#!/bin/bash

cd /home/online/lumine/discord
screen -dmS lumine-discord bash -c "ts-node index.ts"

echo "Lumine Discord Bot started in screen session"

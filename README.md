OC Stalker periodically fetches data about faction members and faction crimes through the use of 2 API v2 calls with minimal access.
Member actions are updated every 10 minutes, crime data every 30 minutes.
Data is currently being stored indefinitely, although a later version will purge old records automatically.
The data is publicly accessibly through this GitHub repository, free for anyone to view the raw code.
A tampermonkey script that is available to selected users acts as a front-end and retrieves this repo to display it on the OC tab.
Currently the only API key in use for this is supplied by the repo owner and code writer Jeyno [2419133].
You are free to copy, modify and repurpose this code.
This script does not violate Torn API or userscript rules.
Services involved are Torn's API, GitHub, GitHub Actions, GitHub API, Cron-job.org and Cloudflare.
Any party involved is free to close their service at any time without notice. Nothing is guaranteed and can break at any moment. Just like life.

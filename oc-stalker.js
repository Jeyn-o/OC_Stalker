// Required Modules
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const base64 = require('js-base64');

// Configuration
const API_KEY = process.env.API_KEY ;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ;
const CRIMES_API_URL = `https://api.torn.com/v2/faction/crimes?offset=0&sort=DESC&comment=AutoTurtle&key=${API_KEY}`;
const MEMBERS_API_URL = `https://api.torn.com/v2/faction/35840/members?striptags=true&comment=AutoTurtle&key=${API_KEY}`;

const GITHUB_OWNER = 'Jeyn-O';
const GITHUB_REPO = 'OC_Stalker';
const GITHUB_PATH = 'BC_cron.JSON';
const GITHUB_BRANCH = 'main';

const HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'Node.js Script'
};

// Utilities
const getUnixTime = () => Math.floor(Date.now() / 1000);

// GitHub Functions
async function getGithubFile() {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${GITHUB_BRANCH}`, {
    headers: HEADERS,
  });
  const data = await res.json();
  return {
    sha: data.sha,
    content: JSON.parse(Buffer.from(data.content, 'base64').toString()),
  };
}

async function uploadToGithub(content, sha) {
  const body = {
    message: `Update by script at ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    sha,
    branch: GITHUB_BRANCH
  };

  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (data.commit) {
    console.log(`Uploaded successfully at ${new Date().toISOString()}`);
  } else {
    console.error('Upload failed:', data);
  }
}

// Fetch Functions
async function fetchData() {
  const [crimesRes, membersRes] = await Promise.all([
    fetch(CRIMES_API_URL),
    fetch(MEMBERS_API_URL)
  ]);

  const [crimesData, membersData] = await Promise.all([
    crimesRes.json(),
    membersRes.json()
  ]);

  return {
    crimes: crimesData.crimes || [],
    members: membersData.members || []
  };
}

// Status Reducer
function reduceStatus(description, details, reviveSetting) {
  let status = '';
  const countryMatch = description.match(/(?:In|Traveling to|Returning to Torn from|Hiding out in) (.+)/i);
  const country = countryMatch ? countryMatch[1] : null;

  if (description.includes('Traveling to')) {
    status = `[${country}] - Going`;
  } else if (description.includes('Returning to Torn from')) {
    status = `[${country}] - Returning`;
  } else if (description.includes('Hiding out in')) {
    status = `[${country}] - Hiding out`;
  } else if (description.includes('In') && country) {
    status = `[${country}] - Idle`;
  } else if (description.includes('In a') || description.includes('In Hospital')) {
    status = `[Hospital]`;
    if (details) {
      if (details.includes('Mugged')) status += ' Mugged';
      else if (details.includes('Attacked')) status += ' Attacked';
      else if (details.includes('Hospitalized')) status += ' Hospitalized';
      else if (details.includes('Lost to')) status += ' Lost';
      else status += ' Event';
    }
  } else if (description.includes('In Jail')) {
    status = 'Jail';
  } else if (description.includes('Federal Jail')) {
    status = 'Fedded';
  } else if (description === 'Okay') {
    status = 'Available';
  }

  if (description.toLowerCase().includes('hospital')) {
    if (reviveSetting === 'Everyone') status += ' - Revives: ALL';
    else if (reviveSetting === 'No one') status += ' - Revives: OFF';
    else status += ' - Revives: Partial';
  }

  return status;
}

// Update JSON DB
function updateDatabase(db, members, crimes) {
  const timestamp = getUnixTime();
  const newDB = { ...db };

  crimes.forEach(crime => {
    if (crime.status !== 'Planning') return;

    crime.slots.forEach(slot => {
      if (!slot.user) return;

      const userId = slot.user.id;
      const member = members.find(m => m.id === userId);
      if (!member) return;

      const reducedStatus = reduceStatus(member.status.description, member.status.details, member.revive_setting);

      if (!newDB[userId]) {
        newDB[userId] = {
          name: member.name,
          activities: [
            {
              status: reducedStatus,
              start: timestamp,
              end: null
            }
          ]
        };
      } else {
        const activities = newDB[userId].activities;
        const last = activities[activities.length - 1];
        if (last.status === reducedStatus) {
          last.end = null; // Still ongoing
        } else {
          last.end = timestamp;
          activities.push({
            status: reducedStatus,
            start: timestamp,
            end: null
          });
        }
      }
    });
  });

  return newDB;
}

// Main Function
(async function run() {
  try {
    const { crimes, members } = await fetchData();
    const { content: db, sha } = await getGithubFile();
    const updated = updateDatabase(db, members, crimes);
    await uploadToGithub(updated, sha);
  } catch (e) {
    console.error('Error running script:', e);
  }
})();

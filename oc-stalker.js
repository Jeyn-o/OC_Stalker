// === CONFIGURATION ===
const local_testing = false;

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const CRIMES_API_URL = `https://api.torn.com/v2/faction/crimes?offset=0&sort=DESC&comment=AutoTurtle&key=${API_KEY}`;
const MEMBERS_API_URL = `https://api.torn.com/v2/faction/35840/members?striptags=true&comment=AutoTurtle&key=${API_KEY}`;

const GITHUB_OWNER = 'Jeyn-O';
const GITHUB_REPO = 'OC_Stalker';
const BRANCH = 'main';

const LOCAL_PATHS = {
  userDb: path.join(__dirname, 'local-oc-data.json'),
  crimesDb: path.join(__dirname, 'local-crimes-data.json'),
  naughtyDb: path.join(__dirname, 'local-naughty-list.json')
};

const GITHUB_PATHS = {
  userDb: 'BC_cron.JSON',
  crimesDb: 'BC_OC.JSON',
  naughtyDb: 'BC_naughty.JSON'
};

const HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'Node.js Script'
};

// === UTILITIES ===
const getUnixTime = () => Math.floor(Date.now() / 1000);

function capitalizeWords(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

// === GitHub Functions ===
async function getGithubFile(path) {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${BRANCH}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch GitHub file ${path}: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return {
    sha: data.sha,
    content: JSON.parse(Buffer.from(data.content, 'base64').toString())
  };
}


async function uploadToGithub(path, content, sha) {
  const current = await getGithubFile(path);
  const newContentStr = JSON.stringify(content, null, 2);
  const currentContentStr = JSON.stringify(current.content, null, 2);

  if (newContentStr === currentContentStr) {
    console.log(`🟡 No changes detected in ${path}, skipping upload.`);
    return;
  }

  const body = {
    message: `Update ${path} at ${new Date().toISOString()}`,
    content: Buffer.from(newContentStr).toString('base64'),
    sha: current.sha,
    branch: BRANCH
  };

  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(body)
  });

  const result = await res.json();
  if (result.commit) {
    console.log(`✅ Uploaded ${path} successfully.`);
  } else {
    console.error(`❌ Failed to upload ${path}:`, result);
  }
}

// === Time Helper from GitHub Commit ===
async function getLastCrimeUpdateTimeFromGitHub() {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?path=${GITHUB_PATHS.crimesDb}&per_page=1`, {
    headers: HEADERS
  });

  if (!res.ok) {
    console.warn(`⚠️ Could not fetch last commit time for ${GITHUB_PATHS.crimesDb}, assuming update is needed.`);
    return 0;
  }

  const commits = await res.json();
  const lastCommitTime = commits[0]?.commit?.committer?.date;
  return lastCommitTime ? Math.floor(new Date(lastCommitTime).getTime() / 1000) : 0;
}


// === FILE I/O Wrappers (Local vs GitHub) ===

async function loadDb(fileKey) {
  const path = local_testing ? LOCAL_PATHS[fileKey] : GITHUB_PATHS[fileKey];

  if (local_testing) {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path));
  } else {
    const { content } = await getGithubFile(path);
    return content;
  }
}

async function saveDb(fileKey, data) {
  console.log(`🔍 saveDb called with key: "${fileKey}"`);
  const filePath = local_testing ? LOCAL_PATHS[fileKey] : GITHUB_PATHS[fileKey];

  if (!filePath) {
    throw new Error(`Invalid fileKey passed to saveDb: "${fileKey}"`);
  }

  if (local_testing) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved ${fileKey} locally to ${filePath}`);
  } else {
    const { sha } = await getGithubFile(filePath);
    await uploadToGithub(filePath, data, sha);
    console.log(`💾 Saved ${fileKey} to GitHub`);
  }
}



// Wrappers to call saveDb with the correct keys
function saveLocalDB(data) {
  return saveDb('userDb', data);
}

function saveLocalCrimes(data) {
  return saveDb('crimesDb', data);
}

function saveNaughtyList(data) {
  return saveDb('naughtyDb', data);
}

// === Status Reducer ===
function reduceStatus(description, details, reviveSetting, state) {
  let status = '';
  const descLower = (description || '').toLowerCase();

  const countryAliases = {
    mexican: 'Mexico',
    cayman: 'Cayman Islands',
    caymanian: 'Cayman Islands',
    canadian: 'Canada',
    hawaiian: 'Hawaii',
    british: 'United Kingdom',
    uk: 'United Kingdom',
    argentinian: 'Argentina',
    argentine: 'Argentina',
    swiss: 'Switzerland',
    japanese: 'Japan',
    chinese: 'China',
    emirati: 'United Arab Emirates',
    uae: 'United Arab Emirates',
    southafrican: 'South Africa',
    sa: 'South Africa'
  };

  let country = null;
  if (descLower.includes('hospital')) {
    const match = description.match(/in (a |an )?([a-z\s]+) hospital/i);
    if (match) {
      const raw = match[2].trim().toLowerCase().replace(/\s+/g, '');
      country = countryAliases[raw] || capitalizeWords(match[2].trim());
    }
    if (!country) country = 'Hospital';
  } else {
    for (const [alias, name] of Object.entries(countryAliases)) {
      if (descLower.includes(alias)) {
        country = name;
        break;
      }
    }
    if (!country) {
      const match = description.match(/(?:Traveling to|Returning to Torn from|Hiding out in|In) ([a-z\s]+)/i);
      if (match) {
        const raw = match[1].trim().toLowerCase().replace(/\s+/g, '');
        country = countryAliases[raw] || capitalizeWords(match[1].trim());
      }
    }
  }

  switch (state) {
  case 'Traveling':
    if (description?.startsWith('Returning')) {
      status = `[${country || 'Traveling'}] - Returning`;
    } else {
      status = `[${country || 'Traveling'}] - Going`;
    }
    break;

  case 'Abroad':
    status = `[${country || 'Abroad'}] - Idle`;
    break;

  case 'Hospital':
    status = `[${country || 'Hospital'}]`;
    if (details?.includes('Mugged')) status += ' Mugged';
    else if (details?.includes('Attacked')) status += ' Attacked';
    else if (details?.includes('Hospitalized')) status += ' Hospitalized';
    else if (details?.includes('Lost to')) status += ' Lost';
    else status += ' Event';
    break;

  case 'Jail':
    status = 'Jail';
    break;

  case 'Okay':
    status = 'Available';
    break;

  default:
    status = descLower.includes('federal jail') ? 'Fedded' : 'Unknown';
}


  if (state === 'Hospital') {
    if (reviveSetting === 'Everyone') status += ' - Revives: ALL';
    else if (reviveSetting === 'No one') status += ' - Revives: OFF';
    else status += ' - Revives: Partial';
  }

  return status;
}

// === FETCH TORN API ===
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

// === ACTIVITY TRACKER ===
function updateActivityDatabase(db, members) {
  const timestamp = getUnixTime();
  const newDB = { ...db };

  members.forEach(member => {
    const userId = member.id;
    const reducedStatus = reduceStatus(
      member.status.description,
      member.status.details,
      member.revive_setting,
      member.status.state
    );

    if (!newDB[userId]) {
      newDB[userId] = {
        name: member.name,
        activities: [{ status: reducedStatus, start: timestamp, end: null }]
      };
    } else {
      const activities = newDB[userId].activities;
      const last = activities[activities.length - 1];

      if (last.status === reducedStatus) {
        last.end = null; // ongoing
      } else {
        last.end = timestamp;
        activities.push({ status: reducedStatus, start: timestamp, end: null });
      }
    }
  });

  return newDB;
}

// === CRIME SLOT/ACTION TRACKING ===
function updateCrimeSlotsAndActions(existing = {}, incoming, timestamp) {
  const updated = {
	name: incoming.name,
    status: incoming.status,
    ready_at: incoming.ready_at ?? existing.ready_at ?? null,
    executed_at: incoming.executed_at ?? existing.executed_at ?? null,
    slots: {},
    action_log: [...(existing.action_log || [])]
  };

  const prevSlots = existing.slots || {};
  const newSlots = incoming.slots || {};
  const all = new Set([...Object.keys(prevSlots), ...Object.keys(newSlots)]);

  all.forEach(slot => {
    const prev = prevSlots[slot];
    const curr = newSlots[slot];

    if (!prev && curr) {
      updated.action_log.push({ timestamp, action: 'joined', slot, ...curr });
    } else if (prev && !curr) {
      updated.action_log.push({ timestamp, action: 'left', slot, ...prev });
    } else if (prev && curr && prev.user_id !== curr.user_id) {
      updated.action_log.push({ timestamp, action: 'left', slot, ...prev });
      updated.action_log.push({ timestamp, action: 'joined', slot, ...curr });
    }

    if (curr) updated.slots[slot] = { ...curr };
  });

  return updated;
}

function updateCrimesDatabase(crimesDb, crimes, membersById) {
  const timestamp = getUnixTime();
  const updatedDb = { ...crimesDb };

  crimes.forEach(crime => {
    const id = crime.id?.toString();
    if (!id) return;

    const status = crime.status.toLowerCase();
    const activeNow = status === 'planning' || status === 'recruiting';
    const wasPlanning = crimesDb[id]?.status?.toLowerCase() === 'planning';

    if (!activeNow && !wasPlanning) return;

    const normalizedSlots = {};
    (crime.slots || []).forEach(slotObj => {
      if (!slotObj.user) return;
      normalizedSlots[slotObj.position_id] = {
        user_id: slotObj.user.id,
        user_name: membersById[slotObj.user.id]?.name || 'Unknown',
        checkpoint_pass_rate: slotObj.checkpoint_pass_rate,
	position: slotObj.position,
	position_number: slotObj.position_number,
	item_available: slotObj.item_requirement.is_available
      };
    });

    const newCrimeData = {
	  name: crime.name,
      status: crime.status,
      ready_at: crime.ready_at,
      executed_at: crime.executed_at,
      previous_crime_id: crime.previous_crime_id,
      expired_at: crime.expired_at,
      difficulty: crime.difficulty,
      slot_amount: crime.slots.length,
      slots: normalizedSlots
    };

    updatedDb[id] = updateCrimeSlotsAndActions(crimesDb[id], newCrimeData, timestamp);
  });

  return updatedDb;
}

// === NAUGHTY LIST ===
function isCrimeFinished(status) {
  return !['planning', 'recruiting'].includes(status.toLowerCase());
}

function updateNaughtyList(naughtyDb, crimesDb, userDb) {
  const now = getUnixTime();
  const updated = { ...naughtyDb };

  for (const [crimeId, crime] of Object.entries(crimesDb)) {
    const start = crime.ready_at;
    const end = crime.executed_at ?? now;
    if (!start || end - start < 60 * 5) continue;

    const alreadyLogged = Object.values(updated).some(e => e.crime_id === parseInt(crimeId));
    if (alreadyLogged) continue;

    const participants = crime.slots;
    if (!participants || Object.keys(participants).length === 0) continue;

    const slackers = new Set();
    const suspicious = new Set();
    const cleared = new Set();
    const promoted = new Set();

    const userTimelines = {};

    for (const slot of Object.values(participants)) {
      const uid = slot.user_id;
      const activities = userDb?.[uid]?.activities || [];
      userTimelines[uid] = activities.filter(act => 
        (act.end ?? end) >= start && act.start <= end
      );
    }

    // 1. Initial check at ready_at
    for (const [uid, acts] of Object.entries(userTimelines)) {
      const currentStatus = acts.find(act => act.start <= start && (!act.end || act.end >= start));
      if (currentStatus && currentStatus.status !== 'Available') {
		slackers.add(uid);
		//console.log(`currentStatus: ${currentStatus}`);
	  }

    }

    // 2. Per-minute scan
    const interval = 60;
    const activeStatus = {};

    for (let t = start; t <= end; t += interval) {
      const unavailableNow = [];

      for (const [uid, acts] of Object.entries(userTimelines)) {
        const act = acts.find(a => a.start <= t && (!a.end || a.end >= t));
        const status = act?.status;
//console.log(`status: ${status}`);
        const isAvailable = status === 'Available';


        if (!isAvailable) {
          unavailableNow.push(uid);
          if (!slackers.has(uid) && !suspicious.has(uid) && !cleared.has(uid)) {
            suspicious.add(uid);
          }
        } else {
          if (suspicious.has(uid)) {
            const othersAvailable = Object.entries(activeStatus)
              .filter(([otherId]) => otherId !== uid)
              .every(([_, avail]) => avail === true);

            if (othersAvailable) {
              promoted.add(uid); // Only one left not available
            } else {
              cleared.add(uid);
            }
            suspicious.delete(uid);
          }
        }
        activeStatus[uid] = isAvailable;
      }
    }

    const finalSlackers = new Set([...slackers, ...promoted]);

    const slackerMeasurements = {};
    for (const uid of finalSlackers) {
      slackerMeasurements[uid] = {
        status: 'pending',
        handled_by: null,
        notes: []
      };
    }

    updated[now.toString()] = {
      crime_id: parseInt(crimeId),
      crime_name: crime.name || `OC ${crimeId}`,
      ready_at: crime.ready_at,
      executed_at: crime.executed_at ?? now,
      crime_participants: participants,
      slackers: slackerMeasurements,
      delay_time: (crime.executed_at ?? now) - crime.ready_at
    };
  }

  return updated;
}







// === MAIN FUNCTION ===
(async function run() {
  try {
    const delay = Math.floor(Math.random() * 5000);
    console.log(`⏳ Delay: ${delay / 1000}s`);
    await new Promise(res => setTimeout(res, delay));

    console.log(`🚀 Running at ${new Date().toISOString()}`);

    const { members, crimes } = await fetchData();
    console.log(`🕵️ Fetched ${crimes.length} crimes.`);

    const membersById = Object.fromEntries(members.map(m => [m.id, m]));

    const userDb = await loadDb('userDb');
    const updatedUsers = updateActivityDatabase(userDb, members);
    await saveDb('userDb', updatedUsers);

    // 🔄 Only update BC_OC and BC_naughty once per half hour
    const now = getUnixTime();
    const lastCrimeUpdate = await getLastCrimeUpdateTimeFromGitHub();
    const oneHour = 3600;

    //if (now - lastCrimeUpdate >= (oneHour/2)) { //half hour
    //  console.log("🕐 It's time to update crimes and naughty list.");

      const crimeDb = await loadDb('crimesDb');
      const updatedCrimes = updateCrimesDatabase(crimeDb, crimes, membersById);
      await saveDb('crimesDb', updatedCrimes);

      const naughtyDb = await loadDb('naughtyDb');
      const updatedNaughty = updateNaughtyList(naughtyDb, updatedCrimes, updatedUsers);
      await saveDb('naughtyDb', updatedNaughty);
    //} else {
    //  console.log("⏩ Skipping crimes and naughty updates — less than 30 minutes since last update.");
    //}

  } catch (err) {
    console.error('❌ Script error:', err);
  }
})();






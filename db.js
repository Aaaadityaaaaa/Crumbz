// Minimal dependency-free persistent JSON datastore.
// Synchronous by design: Express handlers here never await between a read
// and a write, so there's no interleaving risk from Node's single-threaded
// event loop — a "check then set" (like claiming an item) is effectively atomic.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function emptyDb() {
  return { users: [], listings: [], claims: [] };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return emptyDb();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign(emptyDb(), parsed);
  } catch (e) {
    console.error('Could not read database file, starting fresh:', e.message);
    return emptyDb();
  }
}

let db = load();

function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // write to a temp file then rename — avoids a half-written db.json if the
  // process is killed mid-write
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

module.exports = { get db() { return db; }, save };

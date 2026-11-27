// Extra tracking: where the order form stops people, "how did you hear about us", and Microsoft Clarity.
// Form problems are anonymous counts (a code, phone or computer, the day). No typed values, no IP, no cookies.
const { botName } = require('./trafficSources');

// Codes the order page may report. Anything else is ignored, so no typed text can be stored.
const CLIENT_PROBLEMS = new Set([
  's-name', 's-street', 's-city', 's-province', 's-postal', 's-country',
  'r-name', 'r-street', 'r-city', 'r-postal', 'r-province', 'r-province-text', 'r-email', 'r-email-invalid', 'r-military',
  'letter-body', 'letter-too-long', 'agree-terms', 'file-type', 'file-size', 'file-count', 'network',
]);

// Refusals from /api/create-order and the upload step, by the wording of the error.
const SERVER_PROBLEMS = [
  [/paused/i, 'srv-paused'], [/missing required/i, 'srv-missing'], [/valid email/i, 'srv-email'], [/santa/i, 'srv-santa'],
  [/not currently shipping/i, 'srv-destination'], [/order limit/i, 'srv-daily-limit'], [/not available for this destination/i, 'srv-service'],
  [/type your letter or attach/i, 'srv-no-letter'], [/send date/i, 'srv-date'], [/too large/i, 'srv-file-size'], [/too many files/i, 'srv-file-count'],
  [/virus/i, 'srv-file-virus'], [/content validation|only pdf|file type|attachments/i, 'srv-file-bad'], [/pages|envelope|sheet/i, 'srv-too-long'],
];

const HEARD_FROM = {
  google: 'Google', search: 'Bing or another search engine', ai: 'ChatGPT or another AI assistant',
  friend: 'A friend or family member', social: 'Social media', other: 'Somewhere else',
};

const deviceOf = ua => (/Mobi|Android|iPhone|iPad|iPod/i.test(String(ua || '')) ? 'phone' : 'computer');

function recordProblem(db, req, code, country) {
  try {
    if (botName(req.headers['user-agent']) && req.headers['user-agent']) return;
    db.prepare('INSERT INTO form_problems (code, device, country, day) VALUES (?,?,?,?)')
      .run(code, deviceOf(req.headers['user-agent']), String(country || '').slice(0, 2).toUpperCase() || null, new Date().toISOString().slice(0, 10));
  } catch (e) { console.error('[form-problem]', e.message); }
}

// Put in front of the order route: when it answers with an error, count why.
function countRefusals(db) {
  return (req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode >= 400) {
        const msg = String(body?.error || '');
        const code = res.statusCode === 429 ? 'srv-rate-limit'
          : (SERVER_PROBLEMS.find(([re]) => re.test(msg)) || [])[1] || (res.statusCode >= 500 ? 'srv-error' : 'srv-other');
        recordProblem(db, req, code, req.body?.['r-country']);
      }
      return json(body);
    };
    next();
  };
}

// Microsoft Clarity (clicks, scrolling, replays). Only on information pages: never where an address or a letter
// can be on screen. Pages are refused by address, by a private link, and by having any box a visitor can type in.
function clarityLoader(projectId) {
  if (!/^[a-z0-9]{6,20}$/.test(String(projectId || ''))) return '';
  return `
(function(){
  try{if(localStorage.getItem('lh-analytics-consent')==='no')return;}catch(e){}
  if(window.__lhClarity)return;window.__lhClarity=1;
  var PRIVATE=/^\\/((fr|es|uk|us|au)\\/)?(send|santa-letter|track|order-status|order-success|account|admin|reset|verify|unsubscribe|contact|resume|review|pay|login|register)(\\/|\\.html)?$|^\\/(account|order|admin)/;
  var SECRET=/[?&](session_id|token|email|ref|code)=/;
  function start(){
    if(PRIVATE.test(location.pathname)||SECRET.test(location.search)||SECRET.test(document.referrer))return;
    if(document.querySelector('textarea,input:not([type]),input[type=text],input[type=email],input[type=password],input[type=file],input[type=tel]'))return;
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,'clarity','script','${projectId}');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();`;
}

// Clarity's own numbers, shown in the admin. Its export API allows 10 calls a day and covers the last 3 days at most,
// so the answer is saved and asked for again only after four hours (a failed call waits too, so it cannot burn the day).
const CLARITY_WAIT_MS = 4 * 60 * 60 * 1000;
async function clarityInsights({ getSetting, setSetting, fetchImpl = fetch, now = Date.now() }) {
  const project = getSetting('clarity_project_id', '');
  const token = getSetting('clarity_api_token', '');
  if (!token) return { project, configured: false };
  let saved = {};
  try { saved = JSON.parse(getSetting('clarity_cache', '{}')) || {}; } catch {}
  if (!saved.tried || now - saved.tried >= CLARITY_WAIT_MS) {
    saved = { ...saved, tried: now };
    try {
      const r = await fetchImpl('https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3',
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Clarity refused the API token.' : r.status === 429 ? 'Clarity\'s daily limit is used up.' : `Clarity answered with error ${r.status}.`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error('Clarity sent an answer this page cannot read.');
      saved = { tried: now, at: now, metrics: data };
    } catch (e) { saved.error = e.message || 'Could not reach Clarity.'; }
    setSetting('clarity_cache', JSON.stringify(saved));
  }
  return { project, configured: true, at: saved.at || null, metrics: saved.metrics || [], error: saved.error || null };
}

module.exports = { clarityInsights, CLIENT_PROBLEMS, HEARD_FROM, deviceOf, recordProblem, countRefusals, clarityLoader };

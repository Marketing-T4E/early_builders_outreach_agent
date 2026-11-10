'use strict';
// Configuración leída de variables de entorno y de config/sources.json.
const fs = require('fs');
const path = require('path');

const SOURCES_PATH = path.join(__dirname, '..', 'config', 'sources.json');

function loadSources() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
}

const flag = (v, dflt) => (v == null || v === '' ? dflt : v === '1' || v.toLowerCase() === 'true');
const num = (v, dflt) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : dflt);

function settings(env = process.env) {
  return {
    linksEnabled: flag(env.LINKS_ENABLED, false),
    linkDestination: env.LINK_DESTINATION || 'https://go.think4ever.com/developer-network-co',
    utmCampaign: env.UTM_CAMPAIGN || 'developer_network_co_202611',
    lookbackHours: num(env.LOOKBACK_HOURS, 36),
    maxLlmPerRun: num(env.MAX_LLM_PER_RUN, 40),
    minRelevance: num(env.MIN_RELEVANCE, 50),
    maxPostsPerPersonPerDay: num(env.MAX_POSTS_PER_PERSON_PER_DAY, 8),
    requireDistinctApprover: flag(env.REQUIRE_DISTINCT_APPROVER, true),
    scanEnabled: flag(env.SCAN_ENABLED, true),
    scanHour: num(env.SCAN_HOUR, 6),
  };
}

module.exports = { settings, loadSources };

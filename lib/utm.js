'use strict';
// Enlaces con UTM según la convención de la KB (04-herramientas/convencion-utm.md) y el plan de alcance:
// utm_medium=community, utm_campaign={iniciativa}_{pais}_{aaaamm}, utm_content con la comunidad.
// Todo en minúsculas, sin tildes ni espacios, palabras separadas con guion bajo.

const SOURCE_BY_CHANNEL = { stackexchange: 'stackexchange', hn: 'hn', github: 'github' };

function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function buildLink({ destination, channel, campaign, community }) {
  const source = SOURCE_BY_CHANNEL[channel];
  if (!source) throw new Error(`Canal sin utm_source definido: ${channel}`);
  const url = new URL(destination);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'community');
  url.searchParams.set('utm_campaign', slug(campaign));
  url.searchParams.set('utm_content', slug(community) || source);
  return url.toString();
}

module.exports = { buildLink, slug, SOURCE_BY_CHANNEL };

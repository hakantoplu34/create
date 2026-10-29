// Hesap gerektiren platformlar ve girişsiz gezilen arşiv kaynakları.
// loginCookie: oturum açıkken bulunan çerez (durum göstergesi için).
const ACCOUNTS = [
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/', domain: 'instagram.com', loginCookie: 'sessionid' },
  { id: 'pinterest', name: 'Pinterest', url: 'https://www.pinterest.com/', domain: 'pinterest.com', loginCookie: '_auth', loginValue: '1' },
  { id: 'tiktok', name: 'TikTok', url: 'https://www.tiktok.com/', domain: 'tiktok.com', loginCookie: 'sessionid' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', domain: 'youtube.com', loginCookie: 'SAPISID' },
  { id: 'behance', name: 'Behance', url: 'https://www.behance.net/', domain: 'behance.net', loginCookie: null },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/', domain: 'linkedin.com', loginCookie: 'li_at' },
];

const SOURCES = [
  { id: 'adsoftheworld', name: 'Ads of the World', url: 'https://www.adsoftheworld.com/' },
  { id: 'lovethework', name: 'Cannes Lions arşivi', url: 'https://www.lovethework.com/' },
  { id: 'dandad', name: 'D&AD', url: 'https://www.dandad.org/' },
  { id: 'oneshow', name: 'The One Show', url: 'https://www.oneclub.org/' },
  { id: 'metaads', name: 'Meta Reklam Kütüphanesi', url: 'https://www.facebook.com/ads/library/' },
  { id: 'tiktokcc', name: 'TikTok Creative Center', url: 'https://ads.tiktok.com/business/creativecenter/' },
];

// Bir adresin hangi platforma ait olduğunu bul (kayıtta platform etiketi için).
function platformOf(url) {
  try {
    const host = new URL(url).hostname;
    const acc = ACCOUNTS.find((a) => host.endsWith(a.domain));
    if (acc) return acc.id;
    const src = SOURCES.find((s) => host.endsWith(new URL(s.url).hostname.replace(/^www\./, '')));
    return src ? src.id : 'web';
  } catch {
    return 'web';
  }
}

function partitionFor(platformId) {
  return ACCOUNTS.some((a) => a.id === platformId) ? `persist:${platformId}` : 'persist:genel';
}

module.exports = { ACCOUNTS, SOURCES, platformOf, partitionFor };

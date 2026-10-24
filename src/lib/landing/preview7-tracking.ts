import { PREVIEW7_DROPOFF_SECTIONS } from '@/lib/analytics/ad-landing'

/** Same pixel the app layout and the ABO sales ad sets count. */
export const PREVIEW7_APP_PIXEL_ID = '1195395326212201'

export function preview7PixelId(): string | null {
  const pixelId =
    process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ||
    process.env.META_PIXEL_ID?.trim() ||
    PREVIEW7_APP_PIXEL_ID
  return /^\d+$/.test(pixelId) ? pixelId : null
}

type TrackingInput = {
  pixelId: string | null
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
}

/**
 * Preview 7 is a route handler, so the app layout pixel never runs.
 * This puts that same PageView, landing event, and scroll log into the HTML.
 */
export function injectPreview7Tracking(html: string, input: TrackingInput): string {
  const pixel = input.pixelId && /^\d+$/.test(input.pixelId) ? input.pixelId : null
  const supabaseUrl = (input.supabaseUrl || '').replace(/\/$/, '')
  const anonKey = input.supabaseAnonKey || ''
  const dropoff = supabaseUrl.startsWith('https://') && anonKey ? { supabaseUrl, anonKey } : null
  if (!pixel && !dropoff) return html

  const boot = `<script id="preview7-tracking">${trackingScript(pixel, dropoff)}</script>`
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${boot}`)
  }
  return boot + html
}

function trackingScript(
  pixelId: string | null,
  dropoff: { supabaseUrl: string; anonKey: string } | null,
): string {
  const sections = PREVIEW7_DROPOFF_SECTIONS.map((section) => ({
    id: section.id,
    key: section.key,
    index: section.index,
    label: section.label,
  }))
  return `
(function () {
  var params = new URLSearchParams(location.search);
  var fbclid = (params.get('fbclid') || '').trim();
  var fbp = (params.get('fbp') || '').trim();
  var fbc = (params.get('fbc') || '').trim();
  function writeCookie(name, value) {
    var expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
    var encoded = encodeURIComponent(value);
    document.cookie = name + '=' + encoded + '; expires=' + expires + '; path=/; SameSite=Lax';
    document.cookie = name + '=' + encoded + '; expires=' + expires + '; path=/; domain=.lurvox.in; SameSite=Lax';
  }
  if (fbp.indexOf('fb.') === 0) writeCookie('_fbp', fbp);
  if (fbc.indexOf('fb.') === 0) writeCookie('_fbc', fbc);
  else if (fbclid) writeCookie('_fbc', 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + fbclid);

  var traffic = fbclid || /[?&]utm_/.test(location.search) ? 'ad' : 'other';
  ${pixelId ? pixelBoot(pixelId) : ''}
  if (window.fbq) {
    try {
      if (!sessionStorage.getItem('lx_preview7_view')) {
        sessionStorage.setItem('lx_preview7_view', '1');
        window.fbq('trackCustom', 'Lurvox_view_landing', { source: 'preview7', path: '/preview7', traffic: traffic });
      }
    } catch (e) {}
  }
  var dropoffUrl = ${JSON.stringify(dropoff ? `${dropoff.supabaseUrl}/rest/v1/landing_dropoff` : '')};
  var dropoffKey = ${JSON.stringify(dropoff?.anonKey || '')};
  var sections = ${JSON.stringify(sections)};
  function bootDropoff() {
    if (!dropoffUrl || !('IntersectionObserver' in window)) return;
    var sent = {};
    function record(section) {
      if (sent[section.key]) return;
      sent[section.key] = true;
      var session = sessionStorage.getItem('lx_drop');
      if (!session) {
        var bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        session = Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        sessionStorage.setItem('lx_drop', session);
      }
      fetch(dropoffUrl, {
        method: 'POST',
        headers: {
          apikey: dropoffKey,
          Authorization: 'Bearer ' + dropoffKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          session_id: session,
          section_key: section.key,
          section_index: section.index,
          section_label: section.label,
          source: traffic,
          path: '/preview7'
        })
      }).catch(function () {});
    }
    var nodes = sections.map(function (section) {
      return [document.getElementById(section.id), section];
    }).filter(function (row) { return row[0]; });
    if (!nodes.length) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var match = nodes.find(function (row) { return row[0] === entry.target; });
        if (match) record(match[1]);
      });
    }, { threshold: 0, rootMargin: '0px 0px -25% 0px' });
    nodes.forEach(function (row) { observer.observe(row[0]); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootDropoff);
  else bootDropoff();
})();
`.replace(/<\/script/gi, '<\\/script')
}

function pixelBoot(pixelId: string): string {
  return `
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window,document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', ${JSON.stringify(pixelId)});
  fbq('track', 'PageView');
`
}

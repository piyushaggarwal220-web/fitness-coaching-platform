import fs from 'fs';
import path from 'path';
import os from 'os';

const auth = JSON.parse(
  fs.readFileSync(path.join(os.tmpdir(), 'shopify-auth-token.json'), 'utf8')
);
const shop = '9uwyq1-0j.myshopify.com';
const token = auth.access_token;

async function getAsset(themeId, key) {
  const r = await fetch(
    `https://${shop}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  const j = await r.json();
  return j.asset?.value || '';
}

const themes = ['161390362875', '161389281531', '161375289595'];
for (const t of themes) {
  const login = await getAsset(t, 'sections/lurvox-client-login.liquid');
  const hg = await getAsset(t, 'sections/header-group.json');
  const drawer = await getAsset(t, 'snippets/header-drawer.liquid');
  const block = await getAsset(t, 'blocks/ai_gen_block_361650c.liquid');
  console.log('THEME', t);
  console.log('  login offer-strip', login.includes('lurvox-offer-strip'));
  console.log('  login EXISTING CLIENT', login.includes('EXISTING CLIENT'));
  console.log('  login SALE ENDS', login.includes('SALE ENDS IN'));
  console.log('  login schema code setting', login.includes('"id": "code"'));
  try {
    const hgObj = JSON.parse(hg);
    const sec = Object.values(hgObj.sections || {}).find(
      (s) => s.type === 'lurvox-client-login'
    );
    console.log('  hg settings', JSON.stringify(sec?.settings));
  } catch (e) {
    console.log('  hg parse error', e.message);
  }
  console.log('  drawer login', drawer.includes('lurvox-drawer-login'));
  console.log('  price increases', block.includes('Price increases in'));
  console.log('---');
}

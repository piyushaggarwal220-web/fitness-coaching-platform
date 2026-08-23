import fs from 'node:fs'
import path from 'node:path'

const sourceDir = path.join(process.cwd(), 'scripts', 'tmp-new-changes-audit')
const outputDir = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme')

const files = {
  'sections/lurvox-client-login.liquid': 'sections__lurvox-client-login.liquid',
  'sections/header-group.json': 'sections__header-group.json',
  'snippets/header-drawer.liquid': 'snippets__header-drawer.liquid',
  'blocks/_header-logo.liquid': 'blocks___header-logo.liquid',
  'blocks/ai_gen_block_361650c.liquid': 'blocks__ai_gen_block_361650c.liquid',
  'blocks/ai_gen_block_52353f6.liquid': 'blocks__ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_cd3c949.liquid': 'blocks__ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid': 'blocks__ai_gen_block_a7d1b3c.liquid',
  'templates/index.json': 'templates__index.json',
  'locales/en.default.json': 'locales__en.default.json',
  'locales/en.default.schema.json': 'locales__en.default.schema.json',
  'snippets/size-style.liquid': 'snippets__size-style.liquid',
  'snippets/spacing-style.liquid': 'snippets__spacing-style.liquid',
  'snippets/link-featured-image.liquid': 'snippets__link-featured-image.liquid',
  'snippets/accordion-custom-component.liquid': 'snippets__accordion-custom-component.liquid',
  'snippets/resource-card.liquid': 'snippets__resource-card.liquid',
  'snippets/menu-font-styles.liquid': 'snippets__menu-font-styles.liquid',
  'snippets/submenu-font-styles.liquid': 'snippets__submenu-font-styles.liquid',
  'snippets/localization-form.liquid': 'snippets__localization-form.liquid',
  'assets/header-drawer.js': 'assets__header-drawer.js',
  'config/settings_schema.json': 'config__settings_schema.json',
}

const offerStrip = `{%- if section.settings.enabled -%}
  {%- assign show_offer = true -%}
  {%- if section.settings.homepage_only and request.page_type != 'index' -%}
    {%- assign show_offer = false -%}
  {%- endif -%}

  {%- if show_offer -%}
    <aside
      class="lurvox-offer-strip"
      style="--lurvox-offer-accent: {{ section.settings.accent_color }};"
      aria-label="{{ section.settings.eyebrow | escape }}"
    >
      <a class="lurvox-offer-strip__inner" href="{{ section.settings.cta_url }}">
        <span class="lurvox-offer-strip__spark" aria-hidden="true">✦</span>
        <span class="lurvox-offer-strip__eyebrow">{{ section.settings.eyebrow }}</span>
        <span class="lurvox-offer-strip__offer">{{ section.settings.offer_text }}</span>
        <span class="lurvox-offer-strip__code">
          <span>CODE</span>
          <strong>{{ section.settings.code }}</strong>
        </span>
        <span class="lurvox-offer-strip__cta">{{ section.settings.cta_label }} →</span>
      </a>
    </aside>
  {%- endif -%}
{%- endif -%}

{% stylesheet %}
  .lurvox-offer-strip {
    --lurvox-offer-accent: #ff6200;
    position: relative;
    z-index: 4;
    width: 100%;
    overflow: hidden;
    color: #ffffff;
    background:
      radial-gradient(circle at 18% -80%, color-mix(in srgb, var(--lurvox-offer-accent) 46%, transparent), transparent 52%),
      linear-gradient(105deg, #100b08 0%, #17100c 50%, #090909 100%);
    border-bottom: 1px solid color-mix(in srgb, var(--lurvox-offer-accent) 38%, transparent);
  }

  .lurvox-offer-strip::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(110deg, transparent 34%, rgba(255, 255, 255, 0.09) 48%, transparent 62%);
    transform: translateX(-100%);
    animation: lurvox-offer-shine 5.5s ease-in-out infinite;
  }

  .lurvox-offer-strip__inner {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 48px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 7px 20px;
    color: inherit;
    text-decoration: none;
  }

  .lurvox-offer-strip__spark {
    color: var(--lurvox-offer-accent);
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--lurvox-offer-accent) 75%, transparent));
  }

  .lurvox-offer-strip__eyebrow {
    color: rgba(255, 255, 255, 0.62);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .lurvox-offer-strip__offer {
    font-size: 13px;
    font-weight: 750;
    letter-spacing: 0.01em;
  }

  .lurvox-offer-strip__code {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    border: 1px dashed color-mix(in srgb, var(--lurvox-offer-accent) 70%, #ffffff);
    border-radius: 999px;
    background: color-mix(in srgb, var(--lurvox-offer-accent) 12%, transparent);
    box-shadow: 0 0 18px color-mix(in srgb, var(--lurvox-offer-accent) 15%, transparent);
  }

  .lurvox-offer-strip__code span {
    color: rgba(255, 255, 255, 0.58);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .lurvox-offer-strip__code strong {
    color: #ffffff;
    font-size: 12px;
    letter-spacing: 0.1em;
  }

  .lurvox-offer-strip__cta {
    color: var(--lurvox-offer-accent);
    font-size: 11px;
    font-weight: 850;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  header .account-button.header-actions__action,
  header shopify-account,
  header .menu-list__link[href*='/coach/login'] {
    display: none !important;
  }

  @keyframes lurvox-offer-shine {
    0%, 68% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  @media screen and (max-width: 749px) {
    .lurvox-offer-strip__inner {
      min-height: 45px;
      gap: 7px;
      padding: 6px 10px;
    }

    .lurvox-offer-strip__spark,
    .lurvox-offer-strip__eyebrow,
    .lurvox-offer-strip__cta {
      display: none;
    }

    .lurvox-offer-strip__offer {
      font-size: 11px;
      line-height: 1.25;
      text-align: right;
    }

    .lurvox-offer-strip__code {
      flex: 0 0 auto;
      padding: 5px 9px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lurvox-offer-strip::after {
      animation: none;
    }
  }
{% endstylesheet %}

{% schema %}
{
  "name": "LURVOX offer strip",
  "settings": [
    { "type": "checkbox", "id": "enabled", "label": "Show offer strip", "default": true },
    { "type": "checkbox", "id": "homepage_only", "label": "Homepage only", "default": true },
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "FIRST-TIME MEMBER OFFER" },
    { "type": "text", "id": "offer_text", "label": "Offer text", "default": "Save up to ₹400 on coaching" },
    { "type": "text", "id": "code", "label": "Code", "default": "WELCOME" },
    { "type": "text", "id": "cta_label", "label": "CTA label", "default": "View plans" },
    { "type": "url", "id": "cta_url", "label": "CTA link" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#FF6200" }
  ]
}
{% endschema %}
`

function read(relative) {
  return fs.readFileSync(path.join(sourceDir, files[relative]), 'utf8')
}

function write(relative, content) {
  const destination = path.join(outputDir, relative)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, content)
}

function appendImageSettings(content, prefix, labelPrefix) {
  const marker = `    {\n      "type": "image_picker",\n      "id": "${prefix}_25",\n      "label": "${labelPrefix} 25"\n    }`
  const additions = []
  for (let i = 26; i <= 40; i += 1) {
    additions.push(
      `    {\n      "type": "image_picker",\n      "id": "${prefix}_${i}",\n      "label": "${labelPrefix} ${i}"\n    }`
    )
  }
  if (!content.includes(marker)) throw new Error(`Missing ${prefix}_25 marker`)
  return content.replace(marker, `${marker},\n${additions.join(',\n')}`)
}

write('sections/lurvox-client-login.liquid', offerStrip)

const headerGroup = JSON.parse(read('sections/header-group.json'))
headerGroup.sections.lurvox_client_login.settings = {
  enabled: true,
  homepage_only: true,
  eyebrow: 'FIRST-TIME MEMBER OFFER',
  offer_text: 'Save up to ₹400 on coaching',
  code: 'WELCOME',
  cta_label: 'View plans',
  cta_url: 'https://www.lurvox.in/#plans',
  accent_color: '#FF6200',
}
write('sections/header-group.json', JSON.stringify(headerGroup, null, 2))

let drawer = read('snippets/header-drawer.liquid')
const utilityMarker = `      <div\n        class="menu-drawer__utility-links menu-drawer__animated-element"`
const loginMarkup = `      <div class="lurvox-drawer-login-wrap menu-drawer__animated-element">
        <a class="lurvox-drawer-login" href="https://app.lurvox.in/login">
          <span>
            <strong>{{ 'lurvox.client_login' | t }}</strong>
            <small>{{ 'lurvox.client_login_hint' | t }}</small>
          </span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
`
if (!drawer.includes(utilityMarker)) throw new Error('Drawer utility marker missing')
drawer = drawer.replace(utilityMarker, `${loginMarkup}${utilityMarker}`)
drawer = drawer.replace(
  '{% stylesheet %}',
  `{% stylesheet %}
  .lurvox-drawer-login-wrap {
    padding: 14px 18px 4px;
  }

  .lurvox-drawer-login {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    width: 100%;
    padding: 14px 16px;
    border: 1px solid rgba(255, 98, 0, 0.36);
    border-radius: 14px;
    background: linear-gradient(115deg, rgba(255, 98, 0, 0.16), rgba(255, 255, 255, 0.035));
    color: inherit;
    text-decoration: none;
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.06);
  }

  .lurvox-drawer-login span:first-child {
    display: grid;
    gap: 3px;
  }

  .lurvox-drawer-login strong {
    color: #ff7a1a;
    font-size: 13px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .lurvox-drawer-login small {
    color: rgb(var(--color-foreground-rgb) / 0.62);
    font-size: 11px;
  }
`
)
write('snippets/header-drawer.liquid', drawer)

let logo = read('blocks/_header-logo.liquid')
logo = logo.replace(
  `{% liquid
  assign block_settings = block.settings
  assign use_inverse_logo = false

  if section.settings.enable_transparent_header_home and template.name == 'index' and section.settings.home_color_scheme == 'inverse'
    assign use_inverse_logo = true
  elsif section.settings.enable_transparent_header_product and template.name == 'product' and section.settings.product_color_scheme == 'inverse'
    assign use_inverse_logo = true
  elsif section.settings.enable_transparent_header_collection and template.name == 'collection' and section.settings.collection_color_scheme == 'inverse'
    assign use_inverse_logo = true
  endif

  if use_inverse_logo
    if settings.logo_inverse != blank
      assign inverse_logo = settings.logo_inverse
    else
      assign inverse_logo = settings.logo
    endif
  endif

  assign alt_text_fallback = 'accessibility.home_logo_alt' | t: store_name: shop.name
%}`,
  `{% liquid
  assign block_settings = block.settings
%}`
)
logo = logo.replace(
  `  {% liquid
    assign logo_width = settings.logo_height | times: settings.logo.aspect_ratio | ceil
    assign logo_width_mobile = settings.logo_height_mobile | times: settings.logo.aspect_ratio | ceil
    assign inverse_logo_width = settings.logo_height | times: inverse_logo.aspect_ratio | ceil
    assign inverse_logo_width_mobile = settings.logo_height_mobile | times: inverse_logo.aspect_ratio | ceil
    assign logo_style = '--header-logo-image-width: ' | append: logo_width | append: 'px;' | append: '--header-logo-image-width-mobile: ' | append: logo_width_mobile | append: 'px; --header-logo-image-height: ' | append: settings.logo_height | append: 'px; --header-logo-image-height-mobile: ' | append: settings.logo_height_mobile | append: 'px;'
    assign inverse_logo_style = '--header-logo-image-width: ' | append: inverse_logo_width | append: 'px;' | append: '--header-logo-image-width-mobile: ' | append: inverse_logo_width_mobile | append: 'px; --header-logo-image-height: ' | append: settings.logo_height | append: 'px; --header-logo-image-height-mobile: ' | append: settings.logo_height_mobile | append: 'px;'
  %}

`,
  ''
)
const logoStart = logo.indexOf('  <span\n    class="header-logo__image-container header-logo__image-container--original"')
const logoEnd = logo.indexOf('</a>', logoStart)
if (logoStart < 0 || logoEnd < 0) throw new Error('Logo markup not found')
logo =
  logo.slice(0, logoStart) +
  `  <span class="lurvox-training-wordmark" data-testid="header-logo">
    <span>LURVOX</span>
    <small>TRAINING</small>
  </span>
` +
  logo.slice(logoEnd)
logo = logo.replace(
  '{% stylesheet %}',
  `{% stylesheet %}
  .lurvox-training-wordmark {
    display: inline-flex;
    align-items: baseline;
    gap: 7px;
    color: var(--color-foreground);
    font-family: var(--font-heading--family);
    font-size: clamp(16px, 2.2vw, 21px);
    font-weight: 850;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .lurvox-training-wordmark small {
    color: #ff6200;
    font-size: 0.52em;
    font-weight: 850;
    letter-spacing: 0.18em;
  }
`
)
write('blocks/_header-logo.liquid', logo)

let plans = read('blocks/ai_gen_block_361650c.liquid')
const planHeaderEnd = `    </div>\n\n    {% if block.settings.show_urgency %}`
const capacityMarkup = `    </div>

    <div class="lurvox-capacity-tab-{{ ai_gen_id }}" aria-label="Onboarding availability">
      <span class="lurvox-capacity-tab__signal-{{ ai_gen_id }}" aria-hidden="true"></span>
      <span>
        <strong>LIMITED ONBOARDING CAPACITY</strong>
        <small>Applications are open · new clients reviewed daily</small>
      </span>
      <b>OPEN</b>
    </div>

    {% if block.settings.show_urgency %}`
if (!plans.includes(planHeaderEnd)) throw new Error('Plan header marker missing')
plans = plans.replace(planHeaderEnd, capacityMarkup)
plans = plans.replace(
  '{% endstyle %}',
  `  .lurvox-capacity-tab-{{ ai_gen_id }} {
    display: flex;
    align-items: center;
    gap: 12px;
    width: min(100%, 720px);
    margin: 18px auto 22px;
    padding: 13px 16px;
    border: 1px solid rgba(255, 98, 0, 0.3);
    border-radius: 16px;
    background: linear-gradient(110deg, rgba(255, 98, 0, 0.12), rgba(255, 255, 255, 0.025));
    box-shadow: 0 14px 38px rgba(0, 0, 0, 0.26), inset 0 1px rgba(255, 255, 255, 0.05);
    text-align: left;
  }

  .lurvox-capacity-tab__signal-{{ ai_gen_id }} {
    width: 10px;
    height: 10px;
    flex: 0 0 10px;
    border-radius: 999px;
    background: #35d07f;
    box-shadow: 0 0 0 6px rgba(53, 208, 127, 0.11), 0 0 18px rgba(53, 208, 127, 0.52);
  }

  .lurvox-capacity-tab-{{ ai_gen_id }} > span:nth-child(2) {
    display: grid;
    gap: 3px;
    flex: 1;
  }

  .lurvox-capacity-tab-{{ ai_gen_id }} strong {
    color: {{ block.settings.text_color }};
    font-size: 11px;
    letter-spacing: 0.11em;
  }

  .lurvox-capacity-tab-{{ ai_gen_id }} small {
    color: {{ block.settings.secondary_text_color }};
    font-size: 12px;
  }

  .lurvox-capacity-tab-{{ ai_gen_id }} b {
    padding: 5px 9px;
    border-radius: 999px;
    background: rgba(53, 208, 127, 0.12);
    color: #58e596;
    font-size: 10px;
    letter-spacing: 0.1em;
  }

  @media screen and (max-width: 560px) {
    .lurvox-capacity-tab-{{ ai_gen_id }} {
      align-items: flex-start;
      padding: 12px 13px;
    }

    .lurvox-capacity-tab-{{ ai_gen_id }} b {
      display: none;
    }
  }
{% endstyle %}`
)
write('blocks/ai_gen_block_361650c.liquid', plans)

let fitness = read('blocks/ai_gen_block_52353f6.liquid').replaceAll('(1..25)', '(1..40)')
fitness = appendImageSettings(fitness, 'image', 'Image')
write('blocks/ai_gen_block_52353f6.liquid', fitness)

let wins = read('blocks/ai_gen_block_a7d1b3c.liquid').replaceAll('(1..25)', '(1..40)')
wins = appendImageSettings(wins, 'screenshot', 'Screenshot')
write('blocks/ai_gen_block_a7d1b3c.liquid', wins)

let results = read('blocks/ai_gen_block_cd3c949.liquid').replaceAll('(1..25)', '(1..40)')
const transformationMarker = `    {
      "type": "text",
      "id": "client_city_25",
      "label": "Client city"
    }`
const transformationAdditions = []
for (let i = 26; i <= 40; i += 1) {
  transformationAdditions.push(`    {
      "type": "header",
      "content": "Transformation ${i}"
    },
    {
      "type": "image_picker",
      "id": "transformation_image_${i}",
      "label": "Transformation image"
    },
    {
      "type": "text",
      "id": "result_title_${i}",
      "label": "Result headline"
    },
    {
      "type": "textarea",
      "id": "description_${i}",
      "label": "Description"
    },
    {
      "type": "text",
      "id": "client_initials_${i}",
      "label": "Client initials"
    },
    {
      "type": "text",
      "id": "client_name_${i}",
      "label": "Client name"
    },
    {
      "type": "text",
      "id": "client_city_${i}",
      "label": "Client city"
    }`)
}
if (!results.includes(transformationMarker)) throw new Error('Transformation 25 marker missing')
results = results.replace(
  transformationMarker,
  `${transformationMarker},\n${transformationAdditions.join(',\n')}`
)
write('blocks/ai_gen_block_cd3c949.liquid', results)

const index = JSON.parse(read('templates/index.json'))
const planBlock = index.sections.home_blocks_v2.blocks.ai_gen_block_361650c_qqYKXh
planBlock.settings.show_urgency = false
planBlock.settings.urgency_label = 'WELCOME OFFER'
planBlock.settings.urgency_subtext = 'Use code WELCOME for genuine first-time savings.'
write('templates/index.json', JSON.stringify(index, null, 2))

const locale = JSON.parse(read('locales/en.default.json'))
locale.lurvox = {
  ...(locale.lurvox ?? {}),
  client_login: 'Client login',
  client_login_hint: 'Already training or completed payment?',
}
write('locales/en.default.json', JSON.stringify(locale, null, 2))

for (const relative of [
  'locales/en.default.schema.json',
  'snippets/size-style.liquid',
  'snippets/spacing-style.liquid',
  'snippets/link-featured-image.liquid',
  'snippets/accordion-custom-component.liquid',
  'snippets/resource-card.liquid',
  'snippets/menu-font-styles.liquid',
  'snippets/submenu-font-styles.liquid',
  'snippets/localization-form.liquid',
  'assets/header-drawer.js',
  'config/settings_schema.json',
]) {
  write(relative, read(relative))
}

console.log(JSON.stringify({ outputDir, files: Object.keys(files) }, null, 2))

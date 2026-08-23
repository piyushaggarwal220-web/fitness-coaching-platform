/**
 * Raise client photo testimonial limits from 5/6 → 25 on live Shopify theme.
 * Targets:
 *  - blocks/ai_gen_block_52353f6.liquid  (Fitness gallery — exactly 5)
 *  - blocks/ai_gen_block_a7d1b3c.liquid  (Member wins screenshot carousel — 6)
 *  - blocks/ai_gen_block_cd3c949.liquid  (Client results transformations — 6)
 *  - blocks/ai_gen_block_3cbb200.liquid  (older Client results duplicate — 6)
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const NEW_MAX = 25
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const live = JSON.parse(fs.readFileSync(path.join(outDir, 'tmp-live-theme-meta.json'), 'utf8'))

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

function expandFitnessGallery(src) {
  let out = src

  // Doc prompt
  out = out.replace(
    /Create a horizontal image gallery supporting exactly 5 images\./,
    `Create a horizontal image gallery supporting up to ${NEW_MAX} images.`
  )
  out = out.replace(
    /\[ Left Arrow \] \[ Thumbnail 1 Thumbnail 2 Thumbnail 3 Thumbnail 4 Thumbnail 5 \] \[ Right Arrow \]/,
    `[ Left Arrow ] [ Thumbnails 1–${NEW_MAX} (scrollable) ] [ Right Arrow ]`
  )

  // Make thumbs scrollable for many items
  out = out.replace(
    `.ai-fitness-gallery__thumbs-{{ ai_gen_id }} {
    display: flex;
    gap: 8px;
    overflow: hidden;
  }`,
    `.ai-fitness-gallery__thumbs-{{ ai_gen_id }} {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
    max-width: calc(100% - 100px);
  }

  .ai-fitness-gallery__thumbs-{{ ai_gen_id }}::-webkit-scrollbar {
    display: none;
  }`
  )

  // Main gallery + thumbs: only render filled images (keep one placeholder if empty)
  const mainLoop = `        {% assign fitness_slide_index = 0 %}
        {% for i in (1..${NEW_MAX}) %}
          {% assign image_key = 'image_' | append: i %}
          {% assign image = block.settings[image_key] %}
          {% if image != blank %}
            {% assign fitness_slide_index = fitness_slide_index | plus: 1 %}
            <div class="ai-fitness-gallery__slide-{{ ai_gen_id }}" data-slide="{{ fitness_slide_index }}">
              <img
                src="{{ image | image_url: width: 800 }}"
                alt="{{ image.alt | escape }}"
                loading="lazy"
                width="{{ image.width }}"
                height="{{ image.height }}"
                class="ai-fitness-gallery__image-{{ ai_gen_id }}"
              >
            </div>
          {% endif %}
        {% endfor %}
        {% if fitness_slide_index == 0 %}
          <div class="ai-fitness-gallery__slide-{{ ai_gen_id }}" data-slide="1">
            <div style="width: 100%; aspect-ratio: 4/5; background: #1a1a1a; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
              {{ 'image' | placeholder_svg_tag }}
            </div>
          </div>
        {% endif %}`

  out = out.replace(
    /        \{% for i in \(1\.\.5\) %\}\s*\{% assign image_key = 'image_' \| append: i %\}\s*\{% assign image = block\.settings\[image_key\] %\}\s*<div class="ai-fitness-gallery__slide-\{\{ ai_gen_id \}\}" data-slide="\{\{ i \}\}">[\s\S]*?<\/div>\s*\{% endfor %\}/,
    mainLoop
  )

  const thumbLoop = `      {% assign fitness_thumb_index = 0 %}
      {% for i in (1..${NEW_MAX}) %}
        {% assign image_key = 'image_' | append: i %}
        {% assign image = block.settings[image_key] %}
        {% if image != blank %}
          {% assign fitness_thumb_index = fitness_thumb_index | plus: 1 %}
          <div class="ai-fitness-gallery__thumb-{{ ai_gen_id }} {% if fitness_thumb_index == 1 %}active{% endif %}" data-thumb="{{ fitness_thumb_index }}">
            <img
              src="{{ image | image_url: width: 100 }}"
              alt="{{ image.alt | escape }}"
              loading="lazy"
              width="100"
              height="100"
            >
          </div>
        {% endif %}
      {% endfor %}
      {% if fitness_thumb_index == 0 %}
        <div class="ai-fitness-gallery__thumb-{{ ai_gen_id }} active" data-thumb="1">
          <div style="width: 100%; height: 100%; background: #1a1a1a; border-radius: 10px;"></div>
        </div>
      {% endif %}`

  out = out.replace(
    /      \{% for i in \(1\.\.5\) %\}\s*\{% assign image_key = 'image_' \| append: i %\}\s*\{% assign image = block\.settings\[image_key\] %\}\s*<div class="ai-fitness-gallery__thumb-\{\{ ai_gen_id \}\} \{\% if i == 1 \%\}active\{\% endif \%\}" data-thumb="\{\{ i \}\}">[\s\S]*?<\/div>\s*\{% endfor %\}/,
    thumbLoop
  )

  out = out.replace(
    /this\.totalSlides = 5;/,
    `this.totalSlides = this.querySelectorAll('[data-slide]').length || 1;`
  )

  // Expand schema image pickers 6..25
  const extraPickers = []
  for (let i = 6; i <= NEW_MAX; i++) {
    extraPickers.push(`    {
      "type": "image_picker",
      "id": "image_${i}",
      "label": "Image ${i}"
    }`)
  }
  out = out.replace(
    /    \{\s*"type": "image_picker",\s*"id": "image_5",\s*"label": "Image 5"\s*\}/,
    `    {
      "type": "image_picker",
      "id": "image_5",
      "label": "Image 5"
    },
${extraPickers.join(',\n')}`
  )

  if (!out.includes(`(1..${NEW_MAX})`) || !out.includes('image_25')) {
    throw new Error('Fitness gallery expansion failed validation')
  }
  return out
}

function expandMemberWins(src) {
  let out = src.replace(/\{% for i in \(1\.\.6\) %\}/, `{% for i in (1..${NEW_MAX}) %}`)

  // Only render cards with images; keep empty-state on first slot when none set
  out = out.replace(
    /      \{% for i in \(1\.\.25\) %\}\s*\{% liquid\s*assign image_key = 'screenshot_' \| append: i\s*assign screenshot = block\.settings\[image_key\]\s*%\}\s*<div class="ai-member-wins-card-\{\{ ai_gen_id \}\}">[\s\S]*?<\/div>\s*\{% endfor %\}/,
    `      {% assign member_wins_count = 0 %}
      {% for i in (1..${NEW_MAX}) %}
        {% liquid
          assign image_key = 'screenshot_' | append: i
          assign screenshot = block.settings[image_key]
        %}
        {% if screenshot != blank %}
          {% assign member_wins_count = member_wins_count | plus: 1 %}
          <div class="ai-member-wins-card-{{ ai_gen_id }}">
            <img
              src="{{ screenshot | image_url: width: 800 }}"
              alt="{{ screenshot.alt | escape }}"
              loading="lazy"
              width="{{ screenshot.width }}"
              height="{{ screenshot.height }}"
              class="ai-member-wins-card-image-{{ ai_gen_id }}"
            >
          </div>
        {% endif %}
      {% endfor %}
      {% if member_wins_count == 0 %}
        <div class="ai-member-wins-card-{{ ai_gen_id }}">
          <div class="ai-member-wins-card-placeholder-{{ ai_gen_id }}">
            {{ 'image' | placeholder_svg_tag }}
            <div class="ai-member-wins-empty-state-{{ ai_gen_id }}">
              Add member screenshots
            </div>
          </div>
        </div>
      {% endif %}`
  )

  const extras = []
  for (let i = 7; i <= NEW_MAX; i++) {
    extras.push(`    {
      "type": "image_picker",
      "id": "screenshot_${i}",
      "label": "Screenshot ${i}"
    }`)
  }
  out = out.replace(
    /    \{\s*"type": "image_picker",\s*"id": "screenshot_6",\s*"label": "Screenshot 6"\s*\}/,
    `    {
      "type": "image_picker",
      "id": "screenshot_6",
      "label": "Screenshot 6"
    },
${extras.join(',\n')}`
  )

  if (!out.includes('screenshot_25')) throw new Error('Member wins expansion failed')
  return out
}

function expandClientResults(src) {
  let out = src.replace(/\{% for i in \(1\.\.6\) %\}/, `{% for i in (1..${NEW_MAX}) %}`)

  // Build extra schema blocks for transformations 7..25 (no defaults — empty until filled)
  const extras = []
  for (let i = 7; i <= NEW_MAX; i++) {
    extras.push(`    {
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

  // Insert before the closing of settings array — find transformation_image_6 block end
  // Match the last client_city_6 setting object and append after it
  const city6 = /("id":\s*"client_city_6"[\s\S]*?\})/
  if (!city6.test(out)) throw new Error('Could not find client_city_6 in client results schema')
  out = out.replace(city6, `$1,\n${extras.join(',\n')}`)

  if (!out.includes('transformation_image_25')) {
    throw new Error('Client results expansion failed')
  }
  return out
}

// Load current liquid from disk (already fetched)
const files = {
  'blocks/ai_gen_block_52353f6.liquid': expandFitnessGallery(
    fs.readFileSync(path.join(outDir, 'tmp-blocks-ai_gen_block_52353f6.liquid'), 'utf8')
  ),
  'blocks/ai_gen_block_a7d1b3c.liquid': expandMemberWins(
    fs.readFileSync(path.join(outDir, 'tmp-blocks-ai_gen_block_a7d1b3c.liquid'), 'utf8')
  ),
  'blocks/ai_gen_block_cd3c949.liquid': expandClientResults(
    fs.readFileSync(path.join(outDir, 'tmp-blocks-ai_gen_block_cd3c949.liquid'), 'utf8')
  ),
}

// Also update older Client results duplicate if present on disk / theme
const olderPath = path.join(outDir, 'tmp-blocks-ai_gen_block_3cbb200.liquid')
if (fs.existsSync(olderPath)) {
  files['blocks/ai_gen_block_3cbb200.liquid'] = expandClientResults(
    fs.readFileSync(olderPath, 'utf8')
  )
}

for (const [filename, content] of Object.entries(files)) {
  const safe = filename.replaceAll('/', '-')
  fs.writeFileSync(path.join(outDir, `tmp-patched-${safe}`), content)
  console.log('patched', filename, 'len', content.length)
  console.log(
    '  checks:',
    {
      range25: content.includes(`(1..${NEW_MAX})`),
      image25: /image_25|screenshot_25|transformation_image_25/.test(content),
      stillRange5: /\(1\.\.5\)/.test(content),
      stillRange6: /\(1\.\.6\)/.test(content),
    }
  )
}

const upsertFiles = Object.entries(files).map(([filename, content]) => ({
  filename,
  body: { type: 'TEXT', value: content },
}))

const data = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: live.id, files: upsertFiles }
)

console.log(JSON.stringify(data, null, 2))
if (data.themeFilesUpsert.userErrors?.length) {
  process.exit(1)
}
console.log('Deployed to live theme', live.id, live.name)

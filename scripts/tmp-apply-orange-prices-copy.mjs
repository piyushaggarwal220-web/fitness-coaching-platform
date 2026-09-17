import fs from 'fs'
import path from 'path'

const root = path.resolve('scripts/shopify-assets')
const files = []

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(liquid|json)$/.test(name)) files.push(p)
  }
}

walk(root)

const reps = [
  [/₹1,999/g, '₹599'],
  [/₹3,499/g, '₹999'],
  [/₹5,999/g, '₹1,699'],
  [/≈ ₹666/g, '≈ ₹200'],
  [/≈ ₹583/g, '≈ ₹167'],
  [/≈ ₹500/g, '≈ ₹142'],
  [/₹666\/mo/g, '₹200/mo'],
  [/₹583\/mo/g, '₹167/mo'],
  [/₹500\/mo/g, '₹142/mo'],
  [/listPaise:\s*199900/g, 'listPaise: 59900'],
  [/salePaise:\s*199900/g, 'salePaise: 59900'],
  [/listPaise:\s*349900/g, 'listPaise: 99900'],
  [/salePaise:\s*349900/g, 'salePaise: 99900'],
  [/listPaise:\s*599900/g, 'listPaise: 169900'],
  [/salePaise:\s*599900/g, 'salePaise: 169900'],
  [/"plan_2_price":\s*"1999"/g, '"plan_2_price": "599"'],
  [/"plan_3_price":\s*"3499"/g, '"plan_3_price": "999"'],
  [/"plan_4_price":\s*"5999"/g, '"plan_4_price": "1699"'],
  [/"default":\s*"1999"/g, '"default": "599"'],
  [/"default":\s*"3499"/g, '"default": "999"'],
  [/"default":\s*"5999"/g, '"default": "1699"'],
  [/data-value="1999"/g, 'data-value="599"'],
  [/data-value="3499"/g, 'data-value="999"'],
  [/data-value="5999"/g, 'data-value="1699"'],
  [/price:\s*'₹1,999'/g, "price: '₹599'"],
  [/price:\s*'₹3,499'/g, "price: '₹999'"],
  [/price:\s*'₹5,999'/g, "price: '₹1,699'"],
  [/price:\s*"₹1,999"/g, 'price: "₹599"'],
  [/price:\s*"₹3,499"/g, 'price: "₹999"'],
  [/price:\s*"₹5,999"/g, 'price: "₹1,699"'],
  [/"col_1_price":\s*"₹1,999"/g, '"col_1_price": "₹599"'],
  [/"col_2_price":\s*"₹3,499"/g, '"col_2_price": "₹999"'],
  [/"col_3_price":\s*"₹5,999"/g, '"col_3_price": "₹1,699"'],
  [/"default":\s*"₹1,999"/g, '"default": "₹599"'],
  [/"default":\s*"₹3,499"/g, '"default": "₹999"'],
  [/"default":\s*"₹5,999"/g, '"default": "₹1,699"'],
  [/strongs\[0\]\.textContent = '₹1,999'/g, "strongs[0].textContent = '₹599'"],
  [/strongs\[1\]\.textContent = '₹3,499'/g, "strongs[1].textContent = '₹999'"],
  [/strongs\[2\]\.textContent = '₹5,999'/g, "strongs[2].textContent = '₹1,699'"],
  // copy: remove human-coach framing
  [/Human coach in the app\. Weekly phone calls are 12-month only\./g,
    '1-to-1 coaching in the app. Weekly phone calls are 12-month only.'],
  [/<strong>Human coach<\/strong> — not a PDF/g, '<strong>1-to-1 coaching</strong> — not a PDF'],
  [/and a real coach in the app\./g, 'and 1-to-1 coaching in the app.'],
  [/and a human coach on every plan\./g, 'and 1-to-1 coaching on every plan.'],
  [/Workout, diet, and a human coach on every plan\./g,
    'Workout, diet, and 1-to-1 coaching on every plan.'],
  [/a human coach, check-ins/g, '1-to-1 coaching, check-ins'],
  [/Real human coaches/g, '1-to-1 online coaching'],
  [/and a real coach assigned to your case\./g, 'and 1-to-1 coaching assigned to your case.'],
  [/Will I get a real coach\?/g, 'Is this real 1-to-1 coaching?'],
  [/Yes\. A human coach reviews your assessment, check-ins, and progress\. Tools help them work faster — they do not replace the coach\. You also get direct coach chat inside the app\./g,
    'Yes. Your plan, check-ins, and progress are handled as your case — with personalised updates and chat support inside the app.'],
  [/Yes\. A human coach reviews your assessment, check ins, and progress\. Tools help them work faster\. They do not replace the coach\. You also get direct coach chat inside the app\./g,
    'Yes. Your plan, check-ins, and progress are handled as your case — with personalised updates and chat support inside the app.'],
  [/Best human coaching platform in India/g, 'Affordable 1-to-1 online coaching in India'],
  [/<strong>Human coach<\/strong>\. Not a PDF/g, '<strong>1-to-1 coaching</strong>. Not a PDF'],
  [/<th scope="row">Human coach, chat, weekly check-ins<\/th>/g,
    '<th scope="row">1-to-1 coaching, chat, weekly check-ins</th>'],
  [/<h3>Human coach<\/h3>/g, '<h3>1-to-1 coaching</h3>'],
  [/while a real coach builds your plan around you\./g,
    'while your personalised plan is built around you.'],
  [/a focused start with a real coach\./g, 'a focused start with 1-to-1 coaching.'],
]

let changed = 0
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8')
  let n = s
  for (const [a, b] of reps) n = n.replace(a, b)
  if (n !== s) {
    fs.writeFileSync(f, n)
    changed++
    console.log('updated', path.relative(process.cwd(), f))
  }
}
console.log('files changed', changed)

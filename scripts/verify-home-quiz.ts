import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const quiz = fs.readFileSync(path.join('scripts/shopify-assets/snippets-lurvox-home-quiz.liquid'), 'utf8')
const finder = fs.readFileSync(path.join('scripts/shopify-assets/sections-lurvox-plan-finder.liquid'), 'utf8')
const catalog = fs.readFileSync(path.join('scripts/shopify-assets/snippets-lurvox-catalog-home.liquid'), 'utf8')

const quizQuestions = [...quiz.matchAll(/q: '/g)]
assert.equal(quizQuestions.length, 8, 'homepage overlay must ask 8 questions')
assert.match(quiz, /Question 1 of 8/)
assert.match(quiz, /lxq-tab/)
assert.match(quiz, /backdrop-filter: blur\(18px\)/)
assert.match(quiz, /perspective\(1200px\)/)
assert.doesNotMatch(quiz, /How many days a week/)
assert.doesNotMatch(quiz, /Have you worked with a coach before/)

const finderStart = finder.indexOf('var steps = [')
const finderEnd = finder.indexOf('];', finderStart)
const finderBlock = finder.slice(finderStart, finderEnd)
assert.equal([...finderBlock.matchAll(/q: '/g)].length, 8, 'plan finder page must also ask 8 questions')
assert.match(catalog, /render 'lurvox-home-quiz'/)
assert.match(catalog, /choose-your-plan/)

console.log('verify-home-quiz: ok')

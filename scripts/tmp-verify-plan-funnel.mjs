const html = await fetch('https://www.lurvox.in/?v=planfunnelcheck', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

const quiz = await fetch('https://www.lurvox.in/pages/find-your-plan?v=planfunnelcheck', {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())

console.log({
  login: html.includes('Already training with LURVOX'),
  logInLink: html.includes('>Log in'),
  checkoutLinks: (html.match(/checkout\?plan=/g) || []).length,
  planPageLinks: (html.match(/app\.lurvox\.in\/plans\//g) || []).length,
  goalHeadline: html.includes('Pick the goal'),
  tenQuestions: html.includes('10 quick questions'),
  swipe: html.includes('setupSwipe'),
  quizTen: quiz.includes('Question 1 of 10') || quiz.includes('10 quick'),
  quizPlanBase: quiz.includes('data-plan-base="https://app.lurvox.in/plans"'),
})

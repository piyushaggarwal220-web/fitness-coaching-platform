'use client'

import { useState } from 'react'

const MEALS = [
  { id: 'breakfast', title: 'Breakfast', time: '8:00 am', foods: 'Eggs and roti' },
  { id: 'lunch', title: 'Lunch', time: '1:00 pm', foods: 'Dal, rice, curd' },
  { id: 'dinner', title: 'Dinner', time: '8:00 pm', foods: 'Paneer and salad' },
]

const MOVES = [
  { id: 'squat', name: 'Squat', target: '3×8' },
  { id: 'bench', name: 'Bench press', target: '3×8' },
  { id: 'row', name: 'Row', target: '3×10' },
]

const LEFT = ['40 min', '28 min', '14 min', 'Done']

export function PhoneMock() {
  const [screen, setScreen] = useState<'diet' | 'workout'>('diet')
  const [meals, setMeals] = useState<Record<string, boolean>>({ breakfast: true })
  const [moves, setMoves] = useState<Record<string, boolean>>({})
  const mealDone = MEALS.filter((meal) => meals[meal.id]).length
  const moveDone = MOVES.filter((move) => moves[move.id]).length
  const mealScore = Math.round((mealDone / MEALS.length) * 100)
  const moveScore = Math.round((moveDone / MOVES.length) * 100)

  return (
    <div className="st-iphone">
      <div className="st-iphone-screen" aria-label="Demo tracker">
        <div className="st-iphone-status" aria-hidden="true">
          <span>9:41</span>
          <i />
        </div>
        <div className="st-island" aria-hidden="true" />
        <div className="st-iphone-switch" role="group" aria-label="Tracker screen">
          <button type="button" className={screen === 'diet' ? 'is-on' : ''} aria-pressed={screen === 'diet'} onClick={() => setScreen('diet')}>
            Diet
          </button>
          <button type="button" className={screen === 'workout' ? 'is-on' : ''} aria-pressed={screen === 'workout'} onClick={() => setScreen('workout')}>
            Workout
          </button>
        </div>
        {screen === 'diet' ? (
          <div className="st-iphone-app">
            <p className="st-iphone-demo">Demo</p>
            <h3>Diet</h3>
            <div className="st-iphone-meter">
              <span>{mealDone} / {MEALS.length} meals</span>
              <strong>{mealScore}%</strong>
            </div>
            <div className="st-iphone-bar" aria-hidden="true"><i style={{ width: `${mealScore}%` }} /></div>
            {MEALS.map((meal) => (
              <button
                key={meal.id}
                type="button"
                className={meals[meal.id] ? 'is-done' : ''}
                aria-pressed={Boolean(meals[meal.id])}
                onClick={() => setMeals((current) => ({ ...current, [meal.id]: !current[meal.id] }))}
              >
                <span>
                  <strong>{meal.title}</strong>
                  <em>{meal.time} · {meal.foods}</em>
                </span>
                <i />
              </button>
            ))}
          </div>
        ) : (
          <div className="st-iphone-app">
            <p className="st-iphone-demo">Demo</p>
            <h3>Workout</h3>
            <div className="st-iphone-meter">
              <span>{moveDone} / {MOVES.length} exercises</span>
              <strong>{moveScore}%</strong>
            </div>
            <div className="st-iphone-bar" aria-hidden="true"><i style={{ width: `${moveScore}%` }} /></div>
            <div className="st-iphone-stats">
              <p><strong>{moveDone}/{MOVES.length}</strong><span>Exercises</span></p>
              <p><strong>{LEFT[moveDone]}</strong><span>Est. left</span></p>
              <p><strong>—</strong><span>Volume</span></p>
            </div>
            <p className="st-iphone-phase">Main Workout</p>
            {MOVES.map((move) => (
              <button
                key={move.id}
                type="button"
                className={moves[move.id] ? 'is-done' : ''}
                aria-pressed={Boolean(moves[move.id])}
                onClick={() => setMoves((current) => ({ ...current, [move.id]: !current[move.id] }))}
              >
                <span>
                  <strong>{move.name}</strong>
                  <em>{move.target}</em>
                </span>
                <i />
              </button>
            ))}
          </div>
        )}
        <div className="st-iphone-home" aria-hidden="true" />
      </div>
    </div>
  )
}

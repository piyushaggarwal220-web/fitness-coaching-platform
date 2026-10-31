'use client'

import { useMemo, useState } from 'react'
import { onboardingStyles as s } from '@/components/onboarding/styles'
import {
  FOOD_REGIONS,
  customFoodId,
  findCatalogFood,
  foodAllowed,
  foodLabel,
  mergePlaceFoods,
  presetFoodIds,
  resolveCity,
  resolvePlace,
  searchFoods,
  searchPlaceResults,
  type FoodSetting,
} from '@/lib/diet/indian-food-plate'

type FoodPlateValue = {
  food_place_id: string
  food_place_label: string
  food_setting: string
  confirmed_foods: string[]
}

type FoodPlatePickerProps = {
  dietPreference: string
  placeId: string
  placeLabel: string
  setting: string
  foods: string[]
  onChange: (patch: Partial<FoodPlateValue>) => void
}

function asSetting(value: string): FoodSetting {
  return value === 'city' ? 'city' : 'home'
}

export function FoodPlatePicker({
  dietPreference,
  placeId,
  placeLabel,
  setting,
  foods,
  onChange,
}: FoodPlatePickerProps) {
  const [placeQuery, setPlaceQuery] = useState(placeLabel)
  const [foodQuery, setFoodQuery] = useState('')
  const activeSetting = placeId ? asSetting(setting) : null
  const place = placeLabel ? resolvePlace(placeLabel) : null
  const extras = place && place.regionId === placeId ? place.extraFoodIds : []
  const preset = placeId && activeSetting ? presetFoodIds(placeId, activeSetting, dietPreference, extras) : []
  const selected = foods.filter((id) => foodAllowed(id, dietPreference))
  const placeResults = useMemo(() => searchPlaceResults(placeQuery), [placeQuery])
  const placeHits = placeResults.matches
  const foodHits = useMemo(() => searchFoods(foodQuery, dietPreference), [foodQuery, dietPreference])
  const typedFood = foodQuery.trim()
  const catalogFood = findCatalogFood(typedFood)
  const typedCustomId = customFoodId(typedFood)
  const customAllowed = Boolean(typedCustomId && foodAllowed(typedCustomId, dietPreference))
  const showCustomAdd = Boolean(
    typedCustomId &&
      customAllowed &&
      !catalogFood &&
      !selected.includes(typedCustomId) &&
      !foodHits.some((food) => food.label.toLowerCase() === typedFood.toLowerCase())
  )
  const customBlocked = Boolean(typedFood.length >= 2 && typedCustomId && !customAllowed)
  const added = selected.filter((id) => !preset.includes(id))

  function applyPlace(next: { regionId: string; label: string; extraFoodIds: string[] }, nextSetting: FoodSetting) {
    const previous =
      placeId && activeSetting ? presetFoodIds(placeId, activeSetting, dietPreference, extras) : []
    const nextPreset = presetFoodIds(next.regionId, nextSetting, dietPreference, next.extraFoodIds)
    setPlaceQuery(next.label)
    onChange({
      food_place_id: next.regionId,
      food_place_label: next.label,
      food_setting: nextSetting,
      confirmed_foods: mergePlaceFoods(selected, previous, nextPreset, dietPreference),
    })
  }

  function clearPlace() {
    const previous =
      placeId && activeSetting ? presetFoodIds(placeId, activeSetting, dietPreference, extras) : []
    setPlaceQuery('')
    onChange({
      food_place_id: '',
      food_place_label: '',
      food_setting: '',
      confirmed_foods: mergePlaceFoods(selected, previous, [], dietPreference),
    })
  }

  function toggleFood(id: string) {
    if (!foodAllowed(id, dietPreference)) return
    onChange({
      confirmed_foods: selected.includes(id) ? selected.filter((food) => food !== id) : [...selected, id],
    })
  }

  return (
    <div>
      <p style={s.stepHint}>
        Search your city, or pick a region. Remove foods you do not eat. If something you eat is missing, type it
        under “Add a food” — it stays even when it is not on that city’s list.
      </p>

      <label style={s.label} htmlFor="food-place-search">
        City or region
      </label>
      <input
        id="food-place-search"
        value={placeQuery}
        onChange={(event) => setPlaceQuery(event.target.value)}
        placeholder="Sitamarhi, Varanasi, Kochi…"
        style={s.input}
        autoComplete="off"
      />
      {placeHits.length > 0 && normalize(placeQuery) !== normalize(placeLabel) && (
        <div style={s.chipGrid}>
          {placeHits.map((hit) => (
            <button
              key={`${hit.regionId}-${hit.label}`}
              type="button"
              style={{ ...s.chip, marginTop: 8 }}
              onClick={() => applyPlace(hit, activeSetting ?? 'home')}
            >
              {hit.label}
            </button>
          ))}
        </div>
      )}
      {placeResults.total > placeHits.length && (
        <p style={{ ...s.stepHint, marginTop: 8 }}>
          {placeResults.total} cities match. Keep typing to narrow them.
        </p>
      )}
      {placeQuery.trim().length >= 2 && placeResults.total === 0 && !resolveCity(placeQuery) && (
        <p style={{ ...s.stepHint, marginTop: 8 }}>
          That city is not in the list. Pick a region below and “{placeQuery.trim()}” will still be saved as the place.
        </p>
      )}

      <div style={{ ...s.chipGrid, marginTop: 12 }}>
        {FOOD_REGIONS.map((region) => {
          const selectedRegion = placeId === region.id && !place?.extraFoodIds.length && placeLabel === region.label
          return (
            <button
              key={region.id}
              type="button"
              style={{ ...s.chip, ...(selectedRegion ? s.chipSelected : {}) }}
              onClick={() => {
                const typed = placeQuery.trim()
                const city = resolveCity(typed)
                const unknownCity =
                  !city && typed.length >= 2 && typed !== placeLabel && searchPlaceResults(typed).total === 0
                applyPlace(
                  {
                    regionId: region.id,
                    label: city?.label || (unknownCity ? typed : region.label),
                    extraFoodIds: city?.extraFoodIds ?? [],
                  },
                  activeSetting ?? 'home'
                )
              }}
            >
              {region.chip}
            </button>
          )
        })}
        <button type="button" style={{ ...s.chip, ...(!placeId ? s.chipSelected : {}) }} onClick={clearPlace}>
          Search foods only
        </button>
      </div>

      {placeId && (
        <div style={{ marginTop: 16 }}>
          <div style={s.label}>How you usually eat there</div>
          <div style={s.chipGrid}>
            <button
              type="button"
              style={{ ...s.chip, ...(activeSetting === 'home' ? s.chipSelected : {}) }}
              onClick={() =>
                applyPlace(
                  { regionId: placeId, label: placeLabel || regionLabel(placeId), extraFoodIds: extras },
                  'home'
                )
              }
            >
              Mostly home food
            </button>
            <button
              type="button"
              style={{ ...s.chip, ...(activeSetting === 'city' ? s.chipSelected : {}) }}
              onClick={() =>
                applyPlace(
                  { regionId: placeId, label: placeLabel || regionLabel(placeId), extraFoodIds: extras },
                  'city'
                )
              }
            >
              City food — mess, office, restaurants
            </button>
          </div>
        </div>
      )}

      {preset.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={s.label}>Foods on this plate</div>
          <div style={s.chipGrid}>
            {preset.map((id) => (
              <button
                key={id}
                type="button"
                style={{ ...s.chip, ...(selected.includes(id) ? s.chipSelected : {}) }}
                onClick={() => toggleFood(id)}
              >
                {foodLabel(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={s.label} htmlFor="food-item-search">
          Add a food that is not on this list
        </label>
        <input
          id="food-item-search"
          value={foodQuery}
          onChange={(event) => setFoodQuery(event.target.value)}
          placeholder="Type any food, such as makki roti, momos, or beef"
          style={s.input}
          autoComplete="off"
        />
        {foodHits.length > 0 && (
          <div style={{ ...s.chipGrid, marginTop: 8 }}>
            {foodHits.map((food) => (
              <button
                key={food.id}
                type="button"
                style={{ ...s.chip, ...(selected.includes(food.id) ? s.chipSelected : {}) }}
                onClick={() => {
                  if (!selected.includes(food.id)) toggleFood(food.id)
                  setFoodQuery('')
                }}
              >
                {selected.includes(food.id) ? `${food.label} added` : `Add ${food.label}`}
              </button>
            ))}
          </div>
        )}
        {showCustomAdd && typedCustomId && (
          <div style={{ ...s.chipGrid, marginTop: 8 }}>
            <button
              type="button"
              style={{ ...s.chip, ...s.chipSelected }}
              onClick={() => {
                toggleFood(typedCustomId)
                setFoodQuery('')
              }}
            >
              Add “{typedFood}”
            </button>
          </div>
        )}
        {customBlocked && (
          <p style={{ ...s.stepHint, marginTop: 8 }}>
            {typedFood} does not fit a {dietPreference.replace(/_/g, ' ')} diet. Change the diet type if you eat it.
          </p>
        )}
      </div>

      {added.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={s.label}>Added by search</div>
          <div style={s.chipGrid}>
            {added.map((id) => (
              <button key={id} type="button" style={{ ...s.chip, ...s.chipSelected }} onClick={() => toggleFood(id)}>
                {foodLabel(id)} ×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function regionLabel(id: string): string {
  return FOOD_REGIONS.find((region) => region.id === id)?.label ?? ''
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

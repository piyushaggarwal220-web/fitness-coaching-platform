/**
 * Indian plates for coaching intake.
 * A place pre-fills foods. Search or a typed name adds anything else.
 * The saved list is what the plan uses.
 */

import { INDIAN_CITIES, type IndianCity } from '@/lib/diet/indian-cities'

export type FoodTag = 'egg' | 'chicken' | 'fish' | 'mutton' | 'beef' | 'dairy'

export type FoodItem = {
  id: string
  label: string
  aliases: string[]
  tags: FoodTag[]
}

export type FoodSetting = 'home' | 'city'

export type FoodRegion = {
  id: string
  label: string
  chip: string
  home: string[]
  /** Added on top of the home plate for mess, office, and restaurant food. */
  city: string[]
  cities: { name: string; extras?: string[] }[]
}

export const INDIAN_FOODS: readonly FoodItem[] = [
  { id: 'roti', label: 'Roti', aliases: ['chapati', 'phulka', 'chapatti'], tags: [] },
  { id: 'rice', label: 'Rice', aliases: ['chawal', 'rice'], tags: [] },
  { id: 'paratha', label: 'Paratha', aliases: ['parantha'], tags: [] },
  { id: 'poha', label: 'Poha', aliases: ['pohe', 'avalakki'], tags: [] },
  { id: 'bread', label: 'Bread', aliases: ['sandwich', 'bread'], tags: [] },
  { id: 'oats', label: 'Oats', aliases: ['oatmeal', 'oats'], tags: [] },
  { id: 'idli', label: 'Idli', aliases: ['idly', 'idli'], tags: [] },
  { id: 'dosa', label: 'Dosa', aliases: ['dosai', 'dosa'], tags: [] },
  { id: 'upma', label: 'Upma', aliases: ['uppittu', 'upma'], tags: [] },
  { id: 'puttu', label: 'Puttu', aliases: ['puttu'], tags: [] },
  { id: 'appam', label: 'Appam', aliases: ['appam'], tags: [] },
  { id: 'thepla', label: 'Thepla', aliases: ['thepla'], tags: [] },
  { id: 'bhakri', label: 'Bhakri', aliases: ['bhakri', 'jowar roti'], tags: [] },
  { id: 'sattu', label: 'Sattu', aliases: ['sattu'], tags: [] },
  { id: 'ragi_ball', label: 'Ragi ball', aliases: ['ragi', 'ragi mudde', 'ragi ball'], tags: [] },
  { id: 'dal', label: 'Dal', aliases: ['daal', 'lentil', 'dal'], tags: [] },
  { id: 'rajma', label: 'Rajma', aliases: ['kidney beans', 'rajma'], tags: [] },
  { id: 'chole', label: 'Chole', aliases: ['chana', 'chana masala', 'chole'], tags: [] },
  { id: 'kadhi', label: 'Kadhi', aliases: ['kadi', 'kadhi'], tags: ['dairy'] },
  { id: 'aloo_sabzi', label: 'Aloo sabzi', aliases: ['aloo', 'potato sabzi', 'aloo sabzi'], tags: [] },
  { id: 'seasonal_sabzi', label: 'Seasonal sabzi', aliases: ['sabzi', 'subzi', 'vegetable'], tags: [] },
  { id: 'aloo_chokha', label: 'Aloo chokha', aliases: ['chokha', 'aloo chokha'], tags: [] },
  { id: 'varan', label: 'Varan', aliases: ['varan', 'amti'], tags: [] },
  { id: 'bhaji', label: 'Bhaji', aliases: ['bhaji'], tags: [] },
  { id: 'khichdi', label: 'Khichdi', aliases: ['khichri', 'khichdi'], tags: [] },
  { id: 'misal', label: 'Misal', aliases: ['misal pav', 'misal'], tags: [] },
  { id: 'sambar', label: 'Sambar', aliases: ['sambhar', 'sambar'], tags: [] },
  { id: 'rasam', label: 'Rasam', aliases: ['rasam'], tags: [] },
  { id: 'posto', label: 'Posto', aliases: ['posto', 'poppy'], tags: [] },
  { id: 'curd_rice', label: 'Curd rice', aliases: ['curd rice', 'thayir sadam'], tags: ['dairy'] },
  { id: 'bisibelebath', label: 'Bisi bele bath', aliases: ['bisibelebath', 'bisi bele bath'], tags: [] },
  { id: 'coconut_chutney', label: 'Coconut chutney', aliases: ['chutney', 'coconut chutney'], tags: [] },
  { id: 'paneer', label: 'Paneer', aliases: ['paneer', 'cottage cheese'], tags: ['dairy'] },
  { id: 'dahi', label: 'Curd', aliases: ['dahi', 'curd', 'yogurt'], tags: ['dairy'] },
  { id: 'milk', label: 'Milk', aliases: ['doodh', 'milk'], tags: ['dairy'] },
  { id: 'lassi', label: 'Lassi', aliases: ['lassi'], tags: ['dairy'] },
  { id: 'chai', label: 'Chai', aliases: ['tea', 'chai'], tags: [] },
  { id: 'soya', label: 'Soya chunks', aliases: ['soya', 'soy', 'meal maker', 'soya chunks'], tags: [] },
  { id: 'tofu', label: 'Tofu', aliases: ['tofu'], tags: [] },
  { id: 'peanut_butter', label: 'Peanut butter', aliases: ['peanut butter'], tags: [] },
  { id: 'eggs', label: 'Eggs', aliases: ['egg', 'anda', 'omelette', 'bhurji', 'eggs'], tags: ['egg'] },
  { id: 'chicken_curry', label: 'Chicken curry', aliases: ['chicken', 'chicken curry'], tags: ['chicken'] },
  { id: 'fish_curry', label: 'Fish curry', aliases: ['fish', 'macher', 'fish curry'], tags: ['fish'] },
  { id: 'mutton_curry', label: 'Mutton curry', aliases: ['mutton', 'gosht', 'mutton curry'], tags: ['mutton'] },
  { id: 'beef_curry', label: 'Beef curry', aliases: ['beef', 'beef curry'], tags: ['beef'] },
  { id: 'biryani', label: 'Biryani', aliases: ['biriyani', 'biryani'], tags: [] },
  { id: 'haleem', label: 'Haleem', aliases: ['haleem'], tags: [] },
  { id: 'maggi', label: 'Maggi', aliases: ['noodles', 'maggi'], tags: [] },
  { id: 'protein_shake', label: 'Protein shake', aliases: ['whey', 'protein shake', 'shake'], tags: ['dairy'] },
  { id: 'restaurant_roti_meal', label: 'Restaurant roti meal', aliases: ['outside roti', 'roti thali'], tags: [] },
  { id: 'restaurant_rice_meal', label: 'Restaurant rice meal', aliases: ['outside rice', 'rice bowl'], tags: [] },
  { id: 'pav_bhaji', label: 'Pav bhaji', aliases: ['pav bhaji'], tags: [] },
  { id: 'vada_pav', label: 'Vada pav', aliases: ['vada pav', 'wada pav'], tags: [] },
] as const

const FOOD_BY_ID = new Map(INDIAN_FOODS.map((food) => [food.id, food]))

export const FOOD_REGIONS: readonly FoodRegion[] = [
  {
    id: 'north_wheat',
    label: 'North India',
    chip: 'North',
    home: ['roti', 'rice', 'paratha', 'poha', 'dal', 'rajma', 'chole', 'kadhi', 'aloo_sabzi', 'seasonal_sabzi', 'paneer', 'dahi', 'milk', 'lassi', 'chai'],
    city: ['bread', 'eggs', 'oats', 'maggi', 'soya', 'restaurant_roti_meal', 'protein_shake'],
    cities: [
      { name: 'Delhi' },
      { name: 'New Delhi' },
      { name: 'Noida' },
      { name: 'Gurugram' },
      { name: 'Gurgaon' },
      { name: 'Chandigarh' },
      { name: 'Ludhiana' },
      { name: 'Amritsar' },
      { name: 'Jaipur' },
      { name: 'Lucknow' },
      { name: 'Kanpur' },
      { name: 'Indore' },
      { name: 'Bhopal' },
      { name: 'Agra' },
    ],
  },
  {
    id: 'east_plains',
    label: 'East India',
    chip: 'East',
    home: ['rice', 'roti', 'sattu', 'dal', 'aloo_chokha', 'fish_curry', 'chicken_curry', 'posto', 'khichdi', 'seasonal_sabzi', 'chai', 'milk'],
    city: ['bread', 'eggs', 'oats', 'maggi', 'restaurant_rice_meal', 'soya'],
    cities: [
      { name: 'Patna' },
      { name: 'Gaya' },
      { name: 'Kolkata' },
      { name: 'Howrah' },
      { name: 'Bhubaneswar' },
      { name: 'Cuttack' },
      { name: 'Ranchi' },
      { name: 'Jamshedpur' },
    ],
  },
  {
    id: 'west_india',
    label: 'West India',
    chip: 'West',
    home: ['roti', 'bhakri', 'thepla', 'rice', 'varan', 'dal', 'bhaji', 'poha', 'khichdi', 'misal', 'dahi', 'chai'],
    city: ['bread', 'eggs', 'oats', 'maggi', 'restaurant_roti_meal', 'soya', 'protein_shake'],
    cities: [
      { name: 'Ahmedabad' },
      { name: 'Surat' },
      { name: 'Vadodara' },
      { name: 'Rajkot' },
      { name: 'Mumbai', extras: ['pav_bhaji', 'vada_pav'] },
      { name: 'Pune' },
      { name: 'Nagpur' },
      { name: 'Nashik' },
    ],
  },
  {
    id: 'tamil_nadu',
    label: 'Tamil Nadu',
    chip: 'Tamil Nadu',
    home: ['rice', 'idli', 'dosa', 'upma', 'sambar', 'rasam', 'curd_rice', 'coconut_chutney', 'dahi', 'chicken_curry', 'eggs'],
    city: ['bread', 'oats', 'maggi', 'restaurant_rice_meal', 'protein_shake', 'soya'],
    cities: [{ name: 'Chennai' }, { name: 'Coimbatore' }, { name: 'Madurai' }, { name: 'Trichy' }],
  },
  {
    id: 'kerala',
    label: 'Kerala',
    chip: 'Kerala',
    home: ['rice', 'puttu', 'appam', 'idli', 'sambar', 'fish_curry', 'chicken_curry', 'dahi', 'coconut_chutney', 'chai'],
    city: ['bread', 'oats', 'eggs', 'maggi', 'restaurant_rice_meal'],
    cities: [
      { name: 'Kochi' },
      { name: 'Thiruvananthapuram' },
      { name: 'Trivandrum' },
      { name: 'Kozhikode' },
      { name: 'Thrissur' },
    ],
  },
  {
    id: 'andhra_telangana',
    label: 'Andhra & Telangana',
    chip: 'Andhra & Telangana',
    home: ['rice', 'idli', 'dosa', 'upma', 'sambar', 'rasam', 'dahi', 'dal', 'chicken_curry', 'eggs'],
    city: ['bread', 'oats', 'maggi', 'restaurant_rice_meal', 'protein_shake', 'soya'],
    cities: [
      { name: 'Hyderabad', extras: ['biryani', 'haleem'] },
      { name: 'Secunderabad', extras: ['biryani', 'haleem'] },
      { name: 'Vijayawada' },
      { name: 'Visakhapatnam' },
      { name: 'Vizag' },
      { name: 'Warangal' },
    ],
  },
  {
    id: 'karnataka',
    label: 'Karnataka',
    chip: 'Karnataka',
    home: ['rice', 'idli', 'dosa', 'upma', 'sambar', 'bisibelebath', 'dahi', 'chicken_curry', 'ragi_ball'],
    city: ['bread', 'oats', 'eggs', 'maggi', 'restaurant_rice_meal', 'protein_shake', 'soya'],
    cities: [
      { name: 'Bengaluru' },
      { name: 'Bangalore' },
      { name: 'Mysuru' },
      { name: 'Mysore' },
      { name: 'Mangaluru' },
      { name: 'Mangalore' },
      { name: 'Hubli' },
    ],
  },
  {
    id: 'northeast',
    label: 'Northeast',
    chip: 'Northeast',
    home: ['rice', 'dal', 'chicken_curry', 'fish_curry', 'seasonal_sabzi', 'chai', 'milk'],
    city: ['maggi', 'bread', 'eggs', 'oats'],
    cities: [
      { name: 'Guwahati' },
      { name: 'Shillong' },
      { name: 'Imphal' },
      { name: 'Agartala' },
      { name: 'Aizawl' },
    ],
  },
] as const

const ANIMAL: FoodTag[] = ['egg', 'chicken', 'fish', 'mutton', 'beef']
const MIN_CONFIRMED_FOODS = 3
export const CUSTOM_FOOD_PREFIX = 'custom:'

const CITY_NAME_COUNTS = new Map<string, number>()
for (const city of INDIAN_CITIES) {
  const key = normalize(city.name)
  CITY_NAME_COUNTS.set(key, (CITY_NAME_COUNTS.get(key) ?? 0) + 1)
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function foodById(id: string): FoodItem | null {
  return FOOD_BY_ID.get(id) ?? null
}

export function customFoodId(label: string): string | null {
  const clean = label.trim().replace(/\s+/g, ' ')
  if (clean.length < 2 || clean.length > 48) return null
  if (clean.toLowerCase().startsWith(CUSTOM_FOOD_PREFIX)) return null
  return `${CUSTOM_FOOD_PREFIX}${clean}`
}

export function findCatalogFood(label: string): FoodItem | null {
  const q = normalize(label)
  if (!q) return null
  return (
    INDIAN_FOODS.find(
      (food) => normalize(food.label) === q || food.aliases.some((alias) => normalize(alias) === q)
    ) ?? null
  )
}

export function foodLabel(id: string): string {
  if (id.startsWith(CUSTOM_FOOD_PREFIX)) {
    const label = id.slice(CUSTOM_FOOD_PREFIX.length).trim()
    return label || id
  }
  return foodById(id)?.label ?? id.replace(/_/g, ' ')
}

export function foodAllowed(id: string, dietPreference: string | null | undefined): boolean {
  if (id.startsWith(CUSTOM_FOOD_PREFIX)) {
    const match = findCatalogFood(id.slice(CUSTOM_FOOD_PREFIX.length))
    if (!match) return true
    return foodAllowed(match.id, dietPreference)
  }
  const food = foodById(id)
  if (!food) return false
  const tags = food.tags
  if (!dietPreference || dietPreference === 'non_vegetarian') return true
  if (dietPreference === 'eggetarian') {
    return !tags.some((tag) => tag === 'chicken' || tag === 'fish' || tag === 'mutton' || tag === 'beef')
  }
  if (dietPreference === 'vegetarian') {
    return !tags.some((tag) => ANIMAL.includes(tag))
  }
  if (dietPreference === 'vegan') {
    return !tags.some((tag) => ANIMAL.includes(tag) || tag === 'dairy')
  }
  return true
}

export function filterFoodIds(ids: string[] | null | undefined, dietPreference: string | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids ?? []) {
    if (seen.has(id) || !foodAllowed(id, dietPreference)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function hasEnoughConfirmedFoods(ids: string[] | null | undefined, dietPreference: string | null | undefined): boolean {
  return filterFoodIds(ids, dietPreference).length >= MIN_CONFIRMED_FOODS
}

export type ResolvedPlace = {
  regionId: string
  label: string
  extraFoodIds: string[]
}

export function regionById(id: string): FoodRegion | null {
  return FOOD_REGIONS.find((region) => region.id === id) ?? null
}

function toResolved(region: FoodRegion, label: string, extras?: string[]): ResolvedPlace {
  return { regionId: region.id, label, extraFoodIds: extras ?? [] }
}

function cityPlace(city: IndianCity): ResolvedPlace {
  const shared = (CITY_NAME_COUNTS.get(normalize(city.name)) ?? 1) > 1
  return {
    regionId: city.regionId,
    label: shared ? `${city.name}, ${city.state}` : city.name,
    extraFoodIds: [...(city.extras ?? [])],
  }
}

function regionFromQuery(query: string): FoodRegion | null {
  const q = normalize(query)
  return FOOD_REGIONS.find((row) => normalize(row.label) === q || normalize(row.chip) === q) ?? null
}

/** A city only. Region names such as “North India” are not cities. */
export function resolveCity(query: string): ResolvedPlace | null {
  const q = normalize(query)
  if (q.length < 2) return null

  const labeled = INDIAN_CITIES.find((city) => normalize(`${city.name}, ${city.state}`) === q)
  if (labeled) return cityPlace(labeled)

  const exact = INDIAN_CITIES.filter((city) => normalize(city.name) === q)
  if (exact.length === 1) return cityPlace(exact[0])
  return null
}

/** A saved city, including “Aurangabad, Bihar” when the name exists in two states. */
export function resolvePlace(query: string): ResolvedPlace | null {
  return resolveCity(query) ?? (() => {
    const region = regionFromQuery(query)
    if (!region) return null
    return toResolved(region, region.label)
  })()
}

export type PlaceSearch = {
  matches: ResolvedPlace[]
  total: number
}

/** Cities whose name matches. State names match once the query is at least 4 letters. */
export function searchPlaceResults(query: string, limit = 12): PlaceSearch {
  const q = normalize(query)
  if (q.length < 2) return { matches: [], total: 0 }
  const ranked = INDIAN_CITIES.map((city) => {
    const name = normalize(city.name)
    const state = normalize(city.state)
    const nameStarts = name.startsWith(q)
    const nameHas = name.includes(q)
    const stateStarts = q.length >= 4 && state.startsWith(q)
    const rank = nameStarts ? 0 : nameHas ? 1 : stateStarts ? 2 : 3
    return { city, rank }
  })
    .filter((row) => row.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.city.name.localeCompare(b.city.name) || a.city.state.localeCompare(b.city.state))

  return {
    total: ranked.length,
    matches: ranked.slice(0, limit).map((row) => cityPlace(row.city)),
  }
}

export function searchPlaces(query: string, limit = 12): ResolvedPlace[] {
  return searchPlaceResults(query, limit).matches
}

export function presetFoodIds(
  regionId: string,
  setting: FoodSetting,
  dietPreference: string | null | undefined,
  extraFoodIds: string[] = []
): string[] {
  const region = regionById(regionId)
  if (!region) return filterFoodIds(extraFoodIds, dietPreference)
  const ids = setting === 'city' ? [...region.home, ...region.city, ...extraFoodIds] : [...region.home, ...extraFoodIds]
  return filterFoodIds(ids, dietPreference)
}

/** Drop the previous place's foods and keep anything the client added by search. */
export function mergePlaceFoods(
  current: string[],
  previousPreset: string[],
  nextPreset: string[],
  dietPreference: string | null | undefined
): string[] {
  const previous = new Set(previousPreset)
  const kept = current.filter((id) => !previous.has(id))
  return filterFoodIds([...nextPreset, ...kept], dietPreference)
}

export function searchFoods(query: string, dietPreference: string | null | undefined, limit = 8): FoodItem[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const matches: FoodItem[] = []
  for (const food of INDIAN_FOODS) {
    if (!foodAllowed(food.id, dietPreference)) continue
    const haystack = [food.label, food.id.replace(/_/g, ' '), ...food.aliases].map(normalize)
    if (!haystack.some((value) => value.includes(q))) continue
    matches.push(food)
    if (matches.length >= limit) break
  }
  return matches
}

export function formatConfirmedFoods(ids: string[] | null | undefined): string {
  const labels = (ids ?? []).map((id) => foodLabel(id)).filter(Boolean)
  return labels.join(', ')
}
